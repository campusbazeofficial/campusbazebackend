/**
 * BaseService
 *
 * All service classes extend this to get shared config access
 * (client URL, app name, etc.) without repeating env lookups.
 */
export abstract class BaseService {
  protected readonly clientUrl: string;
  protected readonly appName: string;

  constructor() {
    this.clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
    this.appName   = process.env.APP_NAME   || "CampusBase";
  }
}
