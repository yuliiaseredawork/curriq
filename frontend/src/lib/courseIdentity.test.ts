// Local verification for the course identity mapper.
// Run from the frontend dir:  npx tsx src/lib/courseIdentity.test.ts
import assert from 'node:assert';
import { courseIdentity } from './courseIdentity';

assert.strictEqual(courseIdentity('Apache Kafka: Core Concepts').category, 'Messaging Systems');
assert.strictEqual(courseIdentity('Consistent Hashing & Sharding at Scale').category, 'Distributed Systems');
assert.strictEqual(courseIdentity('Intro to Neural Networks and LLMs').category, 'AI');
assert.strictEqual(courseIdentity('Building an ETL Pipeline with Spark').category, 'Data Engineering');
assert.strictEqual(courseIdentity('PostgreSQL Indexing Deep Dive').category, 'Databases');
assert.strictEqual(courseIdentity('Kubernetes for DevOps').category, 'Infrastructure');
assert.strictEqual(courseIdentity('OAuth and TLS Security').category, 'Security');

// Default + empty handling.
assert.strictEqual(courseIdentity('A History of Jazz').category, 'General');
assert.strictEqual(courseIdentity('').category, 'General');
assert.strictEqual(courseIdentity(undefined).category, 'General');

// Identity carries an icon + accent classes.
const id = courseIdentity('Kafka');
assert.ok(id.icon.length > 0 && id.accentClass.includes('border-'));

console.log('courseIdentity.test.ts OK');
