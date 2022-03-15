import type { Binary, Document } from '../bson';
import * as CONSTANTS from '../constants';
import { AbstractCursor } from '../cursor/abstract_cursor';
import type { Db } from '../db';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import { Callback, getTopology, maxWireVersion, MongoDBNamespace } from '../utils';
import { CommandOperation, CommandOperationOptions } from './command';
import { executeOperation, ExecutionResult } from './execute_operation';
import { Aspect, defineAspects } from './operation';

const LIST_COLLECTIONS_WIRE_VERSION = 3;

/** @public */
export interface ListCollectionsOptions extends CommandOperationOptions {
  /** Since 4.0: If true, will only return the collection name in the response, and will omit additional info */
  nameOnly?: boolean;
  /** Since 4.0: If true and nameOnly is true, allows a user without the required privilege (i.e. listCollections action on the database) to run the command when access control is enforced. */
  authorizedCollections?: boolean;
  /** The batchSize for the returned command cursor or if pre 2.8 the systems batch collection */
  batchSize?: number;
}

/** @internal */
export class ListCollectionsOperation extends CommandOperation<string[]> {
  override options: ListCollectionsOptions;
  db: Db;
  filter: Document;
  nameOnly: boolean;
  authorizedCollections: boolean;
  batchSize?: number;

  constructor(db: Db, filter: Document, options?: ListCollectionsOptions) {
    super(db, options);

    this.options = options ?? {};
    this.db = db;
    this.filter = filter;
    this.nameOnly = !!this.options.nameOnly;
    this.authorizedCollections = !!this.options.authorizedCollections;

    if (typeof this.options.batchSize === 'number') {
      this.batchSize = this.options.batchSize;
    }
  }

  override execute(
    server: Server,
    session: ClientSession | undefined,
    callback: Callback<string[]>
  ): void {
    if (maxWireVersion(server) < LIST_COLLECTIONS_WIRE_VERSION) {
      let filter = this.filter;
      const databaseName = this.db.s.namespace.db;

      // If we have legacy mode and have not provided a full db name filter it
      if (typeof filter.name === 'string' && !new RegExp(`^${databaseName}\\.`).test(filter.name)) {
        filter = Object.assign({}, filter);
        filter.name = this.db.s.namespace.withCollection(filter.name).toString();
      }

      // No filter, filter by current database
      if (filter == null) {
        filter = { name: `/${databaseName}/` };
      }

      // Rewrite the filter to use $and to filter out indexes
      if (filter.name) {
        filter = { $and: [{ name: filter.name }, { name: /^((?!\$).)*$/ }] };
      } else {
        filter = { name: /^((?!\$).)*$/ };
      }

      const documentTransform = (doc: Document) => {
        const matching = `${databaseName}.`;
        const index = doc.name.indexOf(matching);
        // Remove database name if available
        if (doc.name && index === 0) {
          doc.name = doc.name.substr(index + matching.length);
        }

        return doc;
      };

      server.query(
        new MongoDBNamespace(databaseName, CONSTANTS.SYSTEM_NAMESPACE_COLLECTION),
        { query: filter },
        { batchSize: this.batchSize || 1000, readPreference: this.readPreference },
        (err, result) => {
          if (result && result.documents && Array.isArray(result.documents)) {
            result.documents = result.documents.map(documentTransform);
          }

          callback(err, result);
        }
      );

      return;
    }

    return super.executeCommand(server, session, this.generateCommand(), callback);
  }

  /* This is here for the purpose of unit testing the final command that gets sent. */
  generateCommand(): Document {
    return {
      listCollections: 1,
      filter: this.filter,
      cursor: this.batchSize ? { batchSize: this.batchSize } : {},
      nameOnly: this.nameOnly,
      authorizedCollections: this.authorizedCollections
    };
  }
}

/** @public */
export interface CollectionInfo extends Document {
  name: string;
  type?: string;
  options?: Document;
  info?: {
    readOnly?: false;
    uuid?: Binary;
  };
  idIndex?: Document;
}

/** @public */
export class ListCollectionsCursor<
  T extends Pick<CollectionInfo, 'name' | 'type'> | CollectionInfo =
    | Pick<CollectionInfo, 'name' | 'type'>
    | CollectionInfo
> extends AbstractCursor<T> {
  parent: Db;
  filter: Document;
  options?: ListCollectionsOptions;

  constructor(db: Db, filter: Document, options?: ListCollectionsOptions) {
    super(getTopology(db), db.s.namespace, options);
    this.parent = db;
    this.filter = filter;
    this.options = options;
  }

  clone(): ListCollectionsCursor<T> {
    return new ListCollectionsCursor(this.parent, this.filter, {
      ...this.options,
      ...this.cursorOptions
    });
  }

  /** @internal */
  _initialize(session: ClientSession | undefined, callback: Callback<ExecutionResult>): void {
    const operation = new ListCollectionsOperation(this.parent, this.filter, {
      ...this.cursorOptions,
      ...this.options,
      session
    });

    executeOperation(this.parent, operation, (err, response) => {
      if (err || response == null) return callback(err);

      // TODO: NODE-2882
      callback(undefined, { server: operation.server, session, response });
    });
  }
}

defineAspects(ListCollectionsOperation, [
  Aspect.READ_OPERATION,
  Aspect.RETRYABLE,
  Aspect.CURSOR_CREATING
]);
