import { expect } from 'chai';
import { MongoClient } from '../../../src/index';

const { ATLAS_DATA_API_KEY } = process.env;
const { ATLAS_DATA_API_END_POINT } = process.env;

describe.only('MongoDB Atlas Data API', () => {
  it('should accept http connection strings', async () => {
    new MongoClient(ATLAS_DATA_API_END_POINT);
  });

  it('should run a findOne', async () => {
    const client = new MongoClient(ATLAS_DATA_API_END_POINT, {
      atlasDataAPIKey: ATLAS_DATA_API_KEY,
      atlasDataAPISource: 'Cluster0'
    });

    await client.connect();

    const mFilms = client.db('sample_mflix');
    const movies = mFilms.collection('movies');

    const mulan = await movies.findOne({ title: 'Mulan' });
    expect(mulan).to.have.property('title', 'Mulan');
    expect(mulan).to.have.property('year', 1998);
  });

  it('should run an insertOne', async () => {
    const client = new MongoClient(ATLAS_DATA_API_END_POINT, {
      atlasDataAPIKey: ATLAS_DATA_API_KEY,
      atlasDataAPISource: 'Cluster0'
    });

    await client.connect();

    const mFilms = client.db('sample_mflix');
    const movies = mFilms.collection('movies');

    const result = await movies.insertOne({ title: 'MyNewMovie' });
    expect(result).to.have.property('acknowledged', true);
    expect(result).to.have.property('insertedId').that.is.a('string');
    // expect(result).to.have.property('insertedId').that.is.instanceOf(ObjectId);
  });
});
