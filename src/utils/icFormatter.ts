/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Formats a Malaysian NRIC into standard dashed format: XXXXXX-XX-XXXX
 * Handles inputs with or without existing dashes.
 */
export const formatIC = (input: string | undefined | null): string => {
  if (!input) return '';
  const str = String(input).trim();
  const digits = str.replace(/\D/g, '');
  
  if (digits.length === 12) {
    return `${digits.slice(0, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 12)}`;
  }
  
  // If partially typed digits (e.g., in an input box)
  if (digits.length > 8) {
    return `${digits.slice(0, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 12)}`;
  } else if (digits.length > 6) {
    return `${digits.slice(0, 6)}-${digits.slice(6)}`;
  }
  
  return str;
};

/**
 * Strips formatting to extract digits only.
 */
export const cleanIC = (input: string | undefined | null): string => {
  if (!input) return '';
  return String(input).replace(/\D/g, '');
};

/**
 * Validates Malaysian 12-digit IC
 */
export const isValidIC = (input: string | undefined | null): boolean => {
  if (!input) return false;
  return cleanIC(input).length === 12;
};
