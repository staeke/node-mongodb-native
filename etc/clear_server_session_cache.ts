#! /usr/bin/env ts-node

/* eslint-disable no-console */
import { expect } from 'chai';
import { promisify } from 'util';

import { Document, MongoClient, MongoDBNamespace, ReadPreference, Server } from '../src/index';
import { ns } from '../src/utils';

const sessionNameSpace = ns('config.system.sessions');

async function runCommandWithoutSession(
  client: MongoClient,
  namespace: MongoDBNamespace,
  command: Document
) {
  const server: Server = await promisify(client.topology.selectServer.bind(client.topology))(
    ReadPreference.primary,
    {}
  );
  expect(server).to.exist;
  return await promisify(server.command.bind(server))(namespace, command, {});
}

async function dropAllSessions(client: MongoClient) {
  const command = { drop: sessionNameSpace.collection };
  const commandResult = await runCommandWithoutSession(client, sessionNameSpace, command);
  expect(commandResult).to.have.property('ok', 1);
}

/** Get the current session count without using a session */
async function countSessions(client: MongoClient) {
  return countDocuments(client, ns('config.system.sessions'));
}

async function killAllSessions(client: MongoClient) {
  return runCommandWithoutSession(client, ns('admin'), { killAllSessions: [] });
}

async function countDocuments(client: MongoClient, namespace: MongoDBNamespace): Promise<number> {
  const command = {
    aggregate: namespace.collection,
    pipeline: [
      { $match: {} }, // all
      { $group: { _id: 1, n: { $sum: 1 } } }
    ],
    cursor: {}
  };
  const commandResult = await runCommandWithoutSession(client, namespace, command);
  expect(commandResult).to.have.property('ok', 1);
  return commandResult.cursor.firstBatch[0]?.n ?? 0;
}

expect(process.env).to.have.property('MONGODB_URI').that.is.a('string');
const client = new MongoClient(process.env.MONGODB_URI);

async function main() {
  await client.connect();
  console.log('current session count:', await countSessions(client));
  console.log('dropping sessions');
  await dropAllSessions(client);
  await killAllSessions(client);
  console.log('dropped all sessions');
  console.log('current session count:', await countSessions(client));
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => client.close());
