"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const promise_1 = __importDefault(require("mysql2/promise"));
const fs_1 = __importDefault(require("fs"));
const client_s3_1 = require("@aws-sdk/client-s3");
const cron_1 = require("cron");
const path_1 = __importDefault(require("path"));
// MySQL connection configuration
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT),
};
// AWS S3 client configuration
const s3Client = new client_s3_1.S3Client({
    region: process.env.AWS_S3_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});
// Function to perform the backup
const backupDatabase = () => __awaiter(void 0, void 0, void 0, function* () {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFilename = `backup-${timestamp}.json`;
    const backupFilePath = path_1.default.join(__dirname, backupFilename);
    try {
        // Connect to the database
        const connection = yield promise_1.default.createConnection(dbConfig);
        console.log("Connected to the database.");
        // Fetch all tables in the database
        const [tables] = yield connection.query("SHOW TABLES");
        const databaseName = process.env.DB_NAME;
        // Structure to hold all the data
        const backupData = {};
        for (const tableObj of tables) {
            const tableName = tableObj[`Tables_in_${databaseName}`];
            console.log(`Backing up table: ${tableName}`);
            // Fetch all data from the current table
            const [rows] = yield connection.query(`SELECT * FROM \`${tableName}\``);
            backupData[tableName] = rows;
        }
        // Write the data to a file
        fs_1.default.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2));
        console.log(`Database backup created: ${backupFilename}`);
        // Upload the backup file to S3
        const fileStream = fs_1.default.createReadStream(backupFilePath);
        const uploadParams = {
            Bucket: process.env.AWS_S3_BUCKET,
            Key: backupFilename,
            Body: fileStream,
        };
        const command = new client_s3_1.PutObjectCommand(uploadParams);
        const data = yield s3Client.send(command);
        const s3Url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_S3_REGION}.amazonaws.com/${backupFilename}`;
        console.log(`Backup successfully uploaded to S3: ${s3Url}`);
        // Delete the local backup file after upload
        fs_1.default.unlinkSync(backupFilePath);
        // Close the database connection
        yield connection.end();
    }
    catch (error) {
        console.error("Error during database backup:", error);
    }
});
// Schedule the backup using cron
const job = new cron_1.CronJob(process.env.CRON_SCHEDULE, backupDatabase, null, true);
console.log("Backup job scheduled with cron expression:", process.env.CRON_SCHEDULE);
// Start the cron job
job.start();
