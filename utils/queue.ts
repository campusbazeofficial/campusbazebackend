type JobHandler<T = any> = (data: T) => Promise<void>;

class SimpleQueue {
  private handlers: Record<string, JobHandler> = {};

  // register worker
  process<T>(jobName: string, handler: JobHandler<T>) {
    this.handlers[jobName] = handler;
  }

  // add job
  async add<T>(jobName: string, data: T) {
    const handler = this.handlers[jobName];

    if (!handler) {
      console.warn(`No handler for job: ${jobName}`);
      return;
    }

    // simulate async background job
    setImmediate(async () => {
      await this.runWithRetry(handler, data);
    });
  }

  private async runWithRetry<T>(
    handler: JobHandler<T>,
    data: T,
    retries = 3
  ) {
    try {
      await handler(data);
    } catch (err) {
      if (retries > 0) {
        console.warn(`Retrying job... (${retries})`);
        setTimeout(() => {
          this.runWithRetry(handler, data, retries - 1);
        }, 2000);
      } else {
        console.error("Job failed permanently:", err);
      }
    }
  }
}

export const emailQueue = new SimpleQueue();