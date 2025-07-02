import { Script } from '@starship-ci/types';
import * as fs from 'fs';
import * as path from 'path';

export class ScriptManager {
  private packageRoot: string;
  private configDir?: string;

  constructor(packageRoot?: string, configDir?: string) {
    // Default to the generator package root (where scripts/ directory is located)
    // __dirname is src/, so we go up one level to get to the package root
    this.packageRoot = packageRoot || path.resolve(__dirname, '..');
    this.configDir = configDir;
  }

  /**
   * Load a script from the filesystem
   */
  loadScript(scriptPath: string): string {
    let fullScriptPath: string;

    // Try config-relative path first (for test configs and custom scripts)
    if (this.configDir) {
      fullScriptPath = path.resolve(this.configDir, scriptPath);
      if (fs.existsSync(fullScriptPath)) {
        return fs.readFileSync(fullScriptPath, 'utf8');
      }
    }

    // Fall back to package root relative path (for default scripts)
    fullScriptPath = path.resolve(this.packageRoot, scriptPath);
    if (!fs.existsSync(fullScriptPath)) {
      const searchPaths = [
        this.configDir ? path.resolve(this.configDir, scriptPath) : null,
        path.resolve(this.packageRoot, scriptPath)
      ].filter(Boolean);

      throw new Error(
        `Script not found: ${scriptPath}. Searched in: ${searchPaths.join(', ')}`
      );
    }

    return fs.readFileSync(fullScriptPath, 'utf8');
  }

  /**
   * Get script content based on Script config
   */
  getScriptContent(scriptConfig: Script): string {
    if (scriptConfig.data) {
      // Use inline script data
      return scriptConfig.data;
    }

    if (scriptConfig.file) {
      // Load from file
      return this.loadScript(scriptConfig.file);
    }

    throw new Error('Script must have either file or data property');
  }

  /**
   * Get all available script files
   */
  getAvailableScripts(): string[] {
    const scriptsDir = path.join(this.packageRoot, 'scripts');
    if (!fs.existsSync(scriptsDir)) {
      return [];
    }

    return fs
      .readdirSync(scriptsDir)
      .filter((file) => file.endsWith('.sh'))
      .sort();
  }

  /**
   * Check if a script file exists
   */
  scriptExists(scriptPath: string): boolean {
    const fullScriptPath = path.resolve(this.packageRoot, scriptPath);
    return fs.existsSync(fullScriptPath);
  }

  /**
   * Get the full path to a script
   */
  getScriptPath(scriptPath: string): string {
    return path.resolve(this.packageRoot, scriptPath);
  }
}
