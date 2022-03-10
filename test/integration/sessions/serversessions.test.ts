import { expect } from 'chai';

describe('ServerSession', () => {
  let client;
  let testCollection;
  beforeEach(async function () {
    const configuration = this.configuration;
    client = await configuration.newClient({ maxPoolSize: 1, monitorCommands: true }).connect();

    // reset test collection
    testCollection = client.db('test').collection('too.many.sessions');
    await testCollection.drop().catch(() => null);
  });

  afterEach(async () => {
    await client?.close(true);
  });

  it('should only use one session for many operations when maxPoolSize is 1', async () => {
    const documents = new Array(50).fill(null).map((_, idx) => ({ _id: idx }));

    const events = [];
    client.on('commandStarted', ev => events.push(ev));
    const allResults = await Promise.all(documents.map(async doc => testCollection.insertOne(doc)));

    expect(allResults).to.have.lengthOf(documents.length);
    expect(events).to.have.lengthOf(documents.length);

    expect(new Set(events.map(ev => ev.command.lsid.id.toString('hex'))).size).to.equal(1);
  });
});
