import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cert, getApps, initializeApp, ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { config } from "./config";

function loadServiceAccount(): ServiceAccount {
  const path = resolve(config.firebase.serviceAccountPath);
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ServiceAccount;
  } catch (error) {
    throw new Error(
      `Nao foi possivel carregar as credenciais do Firebase em ${path}. ` +
      "Copie serviceAccountKey.example.json para serviceAccountKey.json e preencha os dados.",
      { cause: error },
    );
  }
}

const app = getApps()[0] ?? initializeApp({ credential: cert(loadServiceAccount()) });

export const firestore = getFirestore(app);
firestore.settings({ ignoreUndefinedProperties: true });
