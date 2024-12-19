import axios from "axios";
import { PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";

const prisma = new PrismaClient();
const connection = { host: process.env.REDIS_HOST || "localhost", port: Number(process.env.REDIS_PORT) || 6379 };

export async function processTask(id: string, payload: any) {
  try {
    // Atualiza o status da task para "Em Execução"
    await prisma.task.update({
      where: { id },
      data: { status: "Em Execução" },
    });

    // Realiza a requisição HTTP
    const response = await axios(payload);

    // Se sucesso, atualiza para "Concluído"
    await prisma.task.update({
      where: { id },
      data: { status: "Concluído" },
    });

    // Fila de retorno opcional
    if (payload.returnQueue) {
      const returnQueue = new Queue(payload.returnQueue, { connection });
      await returnQueue.add("returnTask", { id, status: "Concluído", result: response.data });
    }
  } catch (error) {
    // Busca a task no banco para obter o número de tentativas e maxRetries
    const task = await prisma.task.findUnique({ where: { id } });

    // Verifica se a task existe e se o campo maxRetries está definido
    if (task && task.maxRetries !== undefined) {
      const nextAttempt = task.attempts + 1;

      if (nextAttempt >= task.maxRetries) {
        // Atualiza o status para "Falha" quando atingir o limite de tentativas
        await prisma.task.update({
          where: { id },
          data: { status: "Falha", attempts: nextAttempt },
        });
        console.error(`Task ${id} falhou após ${task.maxRetries} tentativas.`);
      } else {
        // Atualiza o número de tentativas e lança o erro novamente para retry
        await prisma.task.update({
          where: { id },
          data: { attempts: nextAttempt },
        });
        console.warn(`Task ${id} falhou. Tentativa ${nextAttempt}/${task.maxRetries}.`);
        throw error; // Lança o erro para que o BullMQ faça o retry
      }
    } else {
      console.error(`Task ${id} não encontrada ou maxRetries não definido.`);
    }
  }
}

