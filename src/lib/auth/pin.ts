import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 64;

function derivePin(pin: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      pin,
      salt,
      KEY_LENGTH,
      { N: COST, r: BLOCK_SIZE, p: PARALLELIZATION },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      },
    );
  });
}

export function isPin(value: string): boolean {
  return /^\d{4}$/.test(value);
}

export async function hashPin(pin: string): Promise<string> {
  if (!isPin(pin)) {
    throw new Error("PIN must contain exactly four digits");
  }

  const salt = randomBytes(16);
  const derivedKey = await derivePin(pin, salt);

  return [
    "scrypt",
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  if (!isPin(pin)) {
    return false;
  }

  const [algorithm, cost, blockSize, parallelization, salt, expected] =
    storedHash.split("$");

  if (
    algorithm !== "scrypt" ||
    Number(cost) !== COST ||
    Number(blockSize) !== BLOCK_SIZE ||
    Number(parallelization) !== PARALLELIZATION ||
    !salt ||
    !expected
  ) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected, "base64url");
  const actualBuffer = await derivePin(pin, Buffer.from(salt, "base64url"));

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}
