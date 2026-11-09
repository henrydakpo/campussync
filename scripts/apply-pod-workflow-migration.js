require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

async function applyPodWorkflowMigrations() {
    const migrationPaths = [
        path.join(__dirname, '..', 'migrations', '002_pod_requests_meetups.sql'),
        path.join(__dirname, '..', 'migrations', '003_pod_chat_messages.sql'),
        path.join(__dirname, '..', 'migrations', '004_universities.sql'),
        path.join(__dirname, '..', 'migrations', '005_national_course_pods.sql'),
        path.join(__dirname, '..', 'migrations', '006_feedback.sql')
    ];
    const client = await pool.connect();

    try {
        for (const migrationPath of migrationPaths) {
            const migration = fs.readFileSync(migrationPath, 'utf8');
            await client.query('BEGIN');
            await client.query(migration);
            await client.query('COMMIT');
            console.log(`Database migration applied: ${path.basename(migrationPath)}`);
        }
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Failed to apply database migrations:', error);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

applyPodWorkflowMigrations().catch(async error => {
    console.error('Failed to start database migrations:', error);
    await pool.end();
    process.exitCode = 1;
});
