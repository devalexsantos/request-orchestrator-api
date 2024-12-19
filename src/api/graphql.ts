import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import jwt from 'jsonwebtoken';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { authMiddleware, MyContext } from '../utils/authMiddleware';
import { queueManager } from '../queues/queueManager';
import prisma from '../lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'secretKey';

const typeDefs = `#graphql
  scalar JSON

  type Queue {
    id: ID!
    name: String!
    description: String
    createdAt: String!
    tasks: [Task]
  }

  type Task {
    id: ID!
    status: String!
    attempts: Int!
    maxRetries: Int!
    payload: String!
    createdAt: String!
    updatedAt: String!
  }

  type Query {
    hello: String
    protected: String
    getQueues: [Queue!]!
    getTaskStatus(id: ID!): Task
  }

  type Mutation {
    generateToken(name: String!, email: String!): String
    createQueue(name: String!, description: String!): String
    addTask(queueName: String!, payload: String!, delay: Int!): Task
  }
`;

const resolvers = {
  Query: {
    hello: () => 'Hello, world!',
    protected: (_: unknown, __: unknown, context: MyContext) => {
      if (!context.user) {
        throw new Error('Unauthorized: Token is missing or invalid');
      }
      return `Welcome, ${context.user.name || 'User'}!`;
    },
    getQueues: async (_: unknown, __: unknown, context: MyContext) => {
      if (!context.user) {
        throw new Error('Unauthorized: Token is missing or invalid');
      }
      return await prisma.queue.findMany({
        include: {
          tasks: true
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
    },

    getTaskStatus: async (_: unknown, { id }: { id: string }, context: MyContext) => {
      if (!context.user) {
        throw new Error('Unauthorized: Token is missing or invalid');
      }
      return await prisma.task.findUnique({ where: { id } });
    },
  },

  Mutation: {
    // Cria uma nova fila (protegida)
    createQueue: async (_, { name, description }, context) => {
      if (!context.user) throw new Error("Unauthorized");
      await queueManager.createQueue(name, description, {});
      return "Queue created successfully";
    },

    addTask: async (_, { queueName, payload, delay }, context) => {
      if (!context.user) throw new Error("Unauthorized");
      return await queueManager.addTask(queueName, JSON.parse(payload), delay);
    },

    generateToken: (_, { name, email }) => {
      if (!name || !email) {
        throw new Error('Name and email are required');
      }

      const payload = { name, email };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

      return token;
    },
  },
};

const app = express();
const httpServer = http.createServer(app);


const server = new ApolloServer<MyContext>({
  typeDefs,
  resolvers,
  plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
});

await queueManager.loadQueuesFromDatabase();

await server.start();

app.use(
  '/graphql',
  cors<cors.CorsRequest>({
    origin: ['https://studio.apollographql.com'],
  }),
  express.json(),
  expressMiddleware(server, {
    context: async ({ req }) => {
      try {
        return authMiddleware(req);
      } catch (err) {
        console.error(err);
        return {};
      }
    },
  })
);

await new Promise<void>((resolve) => httpServer.listen({ port: 4000 }, resolve));
console.log(`🚀 Server ready at http://localhost:4000/graphql`);

