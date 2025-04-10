import mongoose from 'mongoose';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Incarca variabilele din .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Conectare la baza de date
const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    console.error('❌ MONGO_URI lipseste in .env');
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}, boss!`);
  } catch (error) {
    console.error(`❌ Eroare la conectare: ${error.message}`);
    process.exit(1);
  }
};

// Conversie $oid, $date din Extended JSON
const convertExtendedJSON = (data) => {
  const convertValue = (value) => {
    if (Array.isArray(value)) {
      return value.map(convertValue); // prioritate array
    }
    if (value && typeof value === 'object') {
      if ('$oid' in value) return value['$oid'];
      if ('$date' in value) return new Date(value['$date']);
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, convertValue(v)]));
    }
    return value;
  };
  return convertValue(data);
};

// Inserare per obiect + log
async function seedCollection(collectionName, filePath) {
  try {
    await fs.access(filePath);
    console.log(`📂 Fisier gasit: ${filePath}`);

    const rawData = await fs.readFile(filePath, 'utf8');
    let jsonData = JSON.parse(rawData);
    jsonData = convertExtendedJSON(jsonData);

    if (!Array.isArray(jsonData) || jsonData.length === 0) {
      console.warn(`⚠️ ${collectionName} e gol sau invalid!`);
      return;
    }

    const Model = mongoose.model(
      collectionName,
      new mongoose.Schema({}, { strict: false }),
      collectionName
    );

    await Model.deleteMany({});
    console.log(`🧹 Colectia ${collectionName} stearsa!`);

    let success = 0;
    for (const [index, doc] of jsonData.entries()) {
      try {
        await Model.create(doc);
        console.log(`✔ ${collectionName} doc #${index + 1} inserat`);
        success++;
      } catch (err) {
        console.error(`❌ Eroare ${collectionName} doc #${index + 1}: ${err.message}`);
      }
    }

    console.log(`✅ ${collectionName}: ${success}/${jsonData.length} inserate cu succes!`);

  } catch (err) {
    console.error(`💥 Eroare la ${collectionName}: ${err.message}`);
  }
}

// Functie principala
async function seedDatabase() {
  try {
    await connectDB();

    const files = await fs.readdir(__dirname);
    const jsonFiles = files.filter(file => file.startsWith('golazodb.') && file.endsWith('.json'));
    console.log(`📦 Fisiere JSON gasite: ${jsonFiles}`);

    if (jsonFiles.length === 0) {
      console.log('⚠️ Niciun fisier golazodb.*.json gasit in utils!');
      return;
    }

    for (const file of jsonFiles) {
      const collectionName = file.replace('golazodb.', '').replace('.json', '');
      const filePath = path.join(__dirname, file);
      await seedCollection(collectionName, filePath);
    }

    console.log('Toate colectiile au fost procesate!');
  } catch (err) {
    console.error('💥 Eroare generala la seeding:', err);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Conexiunea MongoDB a fost inchisa!');
  }
}

// Start
seedDatabase();
