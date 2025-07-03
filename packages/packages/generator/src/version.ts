import packageJson from '../package.json';

/**
 * Get the current version of the generator package
 * @returns The version string from package.json
 */
export const getGeneratorVersion = (): string => {
  return packageJson.version;
};
