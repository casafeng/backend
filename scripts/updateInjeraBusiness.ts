/**
 * Script to update the existing business with Injera information
 * Updates the business with phone number +12602869696 (or the one in TEST_BUSINESS_PHONE env var)
 */

import { PrismaClient } from '@prisma/client';
import { loadEnv } from '../src/config/env';

const prisma = new PrismaClient();

const injeraKnowledgeBase = {
  faqs: [
    {
      answer: 'Sì, è possibile. Potrebbe essere applicato un supplemento.',
      question: 'Posso portare una torta?',
    },
    {
      answer: 'Sì, gli animali sono i benvenuti.',
      question: 'Accettate animali?',
    },
    {
      answer: 'Sì, offriamo diverse opzioni senza glutine e vegetariane.',
      question: 'Avete opzioni senza glutine?',
    },
  ],
  hours: {
    lunch: 'Martedì–Domenica 12:00–15:00',
    notes: "L'area esterna è disponibile solo nella stagione calda e in base al meteo.",
    dinner: 'Martedì–Domenica 19:00–23:30',
  },
  notes: 'Il ristorante può essere particolarmente rumoroso durante il weekend, specialmente dopo le 21:00.',
  address: 'Via Panfilo Castaldi 19, Milano',
  policies: {
    waitingList: "La lista d'attesa è gestita in ordine di arrivo",
    externalArea: 'I tavoli esterni sono soggetti a condizioni meteo',
    lateTolerance: '15 minuti di tolleranza sul ritardo',
    bringYourOwnCake: 'È possibile portare una torta; può essere applicato un supplemento',
    groupCancellation: 'Cancellazione per gruppi con almeno 2 ore di preavviso',
  },
  requirements: {
    groups: 'Per gruppi superiori a 6 persone può essere richiesto un pre-ordine',
    allergies: 'Si consiglia di segnalare allergie o intolleranze in anticipo',
    specialOccasions: 'Per torte personalizzate o decorazioni è consigliato avvisare con 24 ore di anticipo',
  },
  menuHighlights: [
    'Zighinì vegano (legumi, patate, crauti, fagiolini, carote) – cucina eritrea/etiope',
    'Zighinì di carne',
    'Kitfo (carne trita speziata) / Gored Gored (bocconcini di manzo) – cucina tradizionale',
    'Opzioni vegetariane e vegane disponibili',
  ],
  typesOfReservations: [
    'Tavoli standard (1–6 persone)',
    'Prenotazioni di gruppo (7–12 persone)',
    'Eventi e ricorrenze speciali',
    'Richieste speciali: torte personalizzate, decorazioni',
  ],
};

async function updateInjeraBusiness() {
  try {
    loadEnv();
    
    // Get phone number from env or use default
    const phoneNumber = process.env.TEST_BUSINESS_PHONE || '+12602869696';
    
    console.log(`Looking for business with phone number: ${phoneNumber}`);
    
    // Find existing business
    const existingBusiness = await prisma.business.findUnique({
      where: { phoneNumber },
    });
    
    if (!existingBusiness) {
      console.error(`Business with phone number ${phoneNumber} not found.`);
      console.log('Available businesses:');
      const allBusinesses = await prisma.business.findMany();
      allBusinesses.forEach((b) => {
        console.log(`  - ${b.name} (${b.phoneNumber})`);
      });
      process.exit(1);
    }
    
    console.log(`Found business: ${existingBusiness.name} (ID: ${existingBusiness.id})`);
    console.log('Updating to Injera with new knowledge base...');
    
    // Update the business
    const updated = await prisma.business.update({
      where: { phoneNumber },
      data: {
        name: 'Injera',
        timezone: 'Europe/Rome',
        knowledgeBase: injeraKnowledgeBase,
      },
    });
    
    console.log('\n✅ Successfully updated business:');
    console.log(`  Name: ${updated.name}`);
    console.log(`  Phone: ${updated.phoneNumber}`);
    console.log(`  Timezone: ${updated.timezone}`);
    console.log(`  Knowledge Base: ${JSON.stringify(updated.knowledgeBase, null, 2)}`);
    
  } catch (error) {
    console.error('Error updating business:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

updateInjeraBusiness();

