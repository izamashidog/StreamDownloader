/**
 * AESDecryptor - AES-128/AES-256 Decryption for HLS Streams
 * Supports CBC and ECB modes with IV extraction
 */

import type { EncryptionKey, DecryptOptions } from '../../shared/types/m3u8';

export class AESDecryptor {
  private static KEY_LENGTH = 16;
  private static IV_LENGTH = 16;

  /**
   * Convert hex string to Uint8Array
   */
  static hexToBytes(hex: string): Uint8Array {
    const cleanHex = hex.replace(/[^0-9a-fA-F]/g, '');
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
    }
    return bytes;
  }

  /**
   * Convert base64 string to Uint8Array
   */
  static base64ToBytes(base64: string): Uint8Array {
    const cleanBase64 = base64.replace(/[^A-Za-z0-9+\/=]/g, '');
    const binary = atob(cleanBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Convert Uint8Array to hex string
   */
  static bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Parse encryption key from M3U8 format
   */
  static parseKey(keyInfo: EncryptionKey, keyContent: ArrayBuffer): ArrayBuffer {
    if (keyInfo.method === 'NONE' || !keyInfo.key) {
      throw new Error('No encryption key provided');
    }

    let keyBytes: Uint8Array;

    if (keyInfo.key.startsWith('data:')) {
      const base64 = keyInfo.key.split(',')[1]?.replace(/=+$/, '');
      keyBytes = AESDecryptor.base64ToBytes(base64 || '');
    } else if (/^[A-Za-z0-9+\/=]+$/.test(keyInfo.key) && keyInfo.key.length % 4 === 0) {
      try {
        keyBytes = AESDecryptor.base64ToBytes(keyInfo.key);
      } catch {
        keyBytes = AESDecryptor.hexToBytes(keyInfo.key);
      }
    } else {
      keyBytes = AESDecryptor.hexToBytes(keyInfo.key);
    }

    return keyBytes.buffer as ArrayBuffer;
  }

  /**
   * Parse IV (Initialization Vector) from M3U8 format
   */
  static parseIV(ivString: string | null): Uint8Array {
    if (!ivString) {
      return new Uint8Array(AESDecryptor.IV_LENGTH);
    }

    const cleanIv = ivString.startsWith('0x') ? ivString.substring(2) : ivString;
    const ivBytes = AESDecryptor.hexToBytes(cleanIv);

    if (ivBytes.length < AESDecryptor.IV_LENGTH) {
      const padded = new Uint8Array(AESDecryptor.IV_LENGTH);
      padded.set(ivBytes);
      return padded;
    }

    return ivBytes;
  }

  /**
   * AES-128 CBC decryption
   * Uses Web Crypto API for actual decryption
   */
  static async decryptCBC(
    data: ArrayBuffer,
    key: ArrayBuffer,
    iv: Uint8Array
  ): Promise<ArrayBuffer> {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'AES-CBC' },
      false,
      ['decrypt']
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv: new Uint8Array(iv) },
      cryptoKey,
      data
    );

    return decrypted;
  }

  /**
   * AES-128 ECB decryption
   */
  static async decryptECB(
    data: ArrayBuffer,
    key: ArrayBuffer
  ): Promise<ArrayBuffer> {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'AES-ECB' },
      false,
      ['decrypt']
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-ECB' },
      cryptoKey,
      data
    );

    return decrypted;
  }

  /**
   * Decrypt segment data with given encryption info and key
   */
  static async decrypt(
    data: ArrayBuffer,
    keyInfo: EncryptionKey,
    keyContent: ArrayBuffer
  ): Promise<ArrayBuffer> {
    if (keyInfo.method === 'NONE' || !keyContent) {
      return data;
    }

    const key = AESDecryptor.parseKey(keyInfo, keyContent);
    const iv = AESDecryptor.parseIV(keyInfo.iv);

    switch (keyInfo.method) {
      case 'AES-128':
        return AESDecryptor.decryptCBC(data, key, iv);
      case 'AES-256':
        return AESDecryptor.decryptCBC(data, key, iv);
      default:
        throw new Error(`Unsupported encryption method: ${keyInfo.method}`);
    }
  }

  /**
   * Decrypt segment with auto-detection of key format
   */
  static async decryptSegment(
    encryptedData: ArrayBuffer,
    keyUrl: string | null,
    keyData: Map<string, ArrayBuffer>,
    encryption: EncryptionKey
  ): Promise<ArrayBuffer> {
    if (encryption.method === 'NONE' || !encryption.key) {
      return encryptedData;
    }

    let keyContent: ArrayBuffer | undefined;

    if (keyUrl && keyData.has(keyUrl)) {
      keyContent = keyData.get(keyUrl);
    } else if (encryption.key) {
      const keyBytes = AESDecryptor.hexToBytes(encryption.key);
      keyContent = keyBytes.buffer as ArrayBuffer;
    }

    if (!keyContent) {
      throw new Error('Encryption key not found');
    }

    return AESDecryptor.decrypt(encryptedData, encryption, keyContent);
  }

  /**
   * Padding removal for AES-CBC decrypted data
   * PKCS7 padding removal
   */
  static removePadding(data: Uint8Array): Uint8Array {
    if (data.length === 0) {
      return data;
    }

    const paddingLength = data[data.length - 1];

    if (
      paddingLength > 0 &&
      paddingLength <= AESDecryptor.KEY_LENGTH &&
      paddingLength <= data.length
    ) {
      const isValidPadding = data.slice(-paddingLength).every(b => b === paddingLength);

      if (isValidPadding) {
        return data.slice(0, data.length - paddingLength);
      }
    }

    return data;
  }

  /**
   * Fetch and decrypt a segment URL
   */
  static async fetchAndDecrypt(
    url: string,
    keyInfo: EncryptionKey,
    keyData: Map<string, ArrayBuffer>,
    options: RequestInit = {}
  ): Promise<ArrayBuffer> {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`Failed to fetch segment: ${response.status} ${response.statusText}`);
    }

    const encryptedData = await response.arrayBuffer();

    if (keyInfo.method === 'NONE') {
      return encryptedData;
    }

    const decrypted = await AESDecryptor.decryptSegment(
      encryptedData,
      keyInfo.key,
      keyData,
      keyInfo
    );

    return decrypted;
  }
}
