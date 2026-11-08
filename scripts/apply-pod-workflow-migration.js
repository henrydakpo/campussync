require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

async function applyPodWorkflowMigration() {
    const migrationPath = path.join(__dirname, '..', 'migrations', '002_pod_requests_meetups.sql');
    const migration = fs.readFileSync(migrationPath, 'utf8');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        await client.query(migration);
        await client.query('COMMIT');
        console.log('Pod request and meetup database migration applied.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Failed to apply pod request and meetup database migration:', error);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

applyPodWorkflowMigration().catch(async error => {
    console.error('Failed to start pod request and meetup database migration:', error);
    await pool.end();
    process.exitCode = 1;
});
