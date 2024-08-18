import * as dotenv from "dotenv";
dotenv.config();

import mysql from "mysql2/promise";
import fs from "fs";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { CronJob } from "cron";
import path from "path";

// MySQL connection configuration
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT),
};

// AWS S3 client configuration
const s3Client = new S3Client({
  region: process.env.AWS_S3_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// Function to perform the backup
const backupDatabase = async (): Promise<void> => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFilename = `backup-${timestamp}.json`;
  const backupFilePath = path.join(__dirname, backupFilename);

  try {
    // Connect to the database
    const connection = await mysql.createConnection(dbConfig);
    console.log("Connected to the database.");

    // Fetch all tables in the database
    const [tables]: [any[], any] = await connection.query("SHOW TABLES");
    const databaseName = process.env.DB_NAME;

    // Structure to hold all the data
    const backupData: Record<string, any[]> = {};

    for (const tableObj of tables) {
      const tableName = tableObj[`Tables_in_${databaseName}`];
      console.log(`Backing up table: ${tableName}`);

      // Fetch all data from the current table
      const [rows]: [any[], any] = await connection.query(
        `SELECT * FROM \`${tableName}\``
      );
      backupData[tableName] = rows;
    }

    // Write the data to a file
    fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2));
    console.log(`Database backup created: ${backupFilename}`);

    // Upload the backup file to S3
    const fileStream = fs.createReadStream(backupFilePath);
    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: backupFilename,
      Body: fileStream,
    };

    const command = new PutObjectCommand(uploadParams);
    const data = await s3Client.send(command);

    const s3Url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_S3_REGION}.amazonaws.com/${backupFilename}`;
    console.log(`Backup successfully uploaded to S3: ${s3Url}`);

    // Delete the local backup file after upload
    fs.unlinkSync(backupFilePath);

    // Close the database connection
    await connection.end();
  } catch (error) {
    console.error("Error during database backup:", error);
  }
};

// Schedule the backup using cron
const job = new CronJob(process.env.CRON_SCHEDULE!, backupDatabase, null, true);
console.log(
  "Backup job scheduled with cron expression:",
  process.env.CRON_SCHEDULE
);

// Start the cron job
job.start();
