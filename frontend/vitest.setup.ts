import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'

// Polyfill IndexedDB for tests
global.indexedDB = new IDBFactory()
