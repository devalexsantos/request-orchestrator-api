import { Queue, Worker, Job } from "bullmq";
import { PrismaClient } from "@prisma/client";
import { processTask } from "./taskProcessor";
import { validatePayload } from "../utils/validator";

const prisma = new PrismaClient();
const connection = { host: process.env.REDIS_HOST || "localhost", port: Number(process.env.REDIS_PORT) || 6379 };

export const queueManager = {
  queues: new Map<string, Queue>(),

  async loadQueuesFromDatabase() {
    const savedQueues = await prisma.queue.findMany();
    for (const { name, description } of savedQueues) {
      await this.createQueue(name, description, {});
      console.log(`Queue ${name} loaded from database.`);
    }
  },

  async createQueue(name: string, description: string, defaultJobOptions: any) {
    if (!this.queues.has(name)) {
      // Adiciona a fila ao banco de dados (tabela Queue)
      await prisma.queue.upsert({
        where: { name },
        update: {},
        create: { name, description },
      });

      // Cria uma nova fila BullMQ
      const queue = new Queue(name, {
        connection,
        defaultJobOptions: {
          attempts: defaultJobOptions.attempts || 3,
          backoff: {
            type: defaultJobOptions.backoffType || "exponential", // Configuração de backoff
            delay: defaultJobOptions.backoffDelay || 5000, // Delay base
          },
        },
      });


      // Cria um Worker para processar as tasks
      new Worker(
        name,
        async (job: Job) => {
          const { id, payload } = job.data;
          await processTask(id, payload);
        },
        { connection } // Permite execução paralela
      );

      this.queues.set(name, queue);
    }

    return this.queues.get(name);
  },

  async addTask(queueName: string, payload: any, delay = 0, retries = 3) {
    validatePayload(payload);
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Queue ${queueName} not found`);

    const queueId = (await prisma.queue.findUnique({ where: { name: queueName } }))?.id;

    if (!queueId) throw new Error(`Queue ${queueName} not found`);

    const stringPayload = JSON.stringify(payload);

    const task = await prisma.task.create({
      data: { queueId, queueName, payload: stringPayload, maxRetries: retries },
    });

    await queue.add(task.id.toString(), { id: task.id, payload }, { delay });
    return task;
  },

  async listQueues() {
    return await prisma.queue.findMany();
  },

  async cancelTask(queueName: string, jobId: string) {
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error("Queue not found");

    const job = await queue.getJob(jobId);
    if (job) await job.remove();
  },
};

