
/**
 * OFFLINE QUEUE
 * Stores events locally when network is down
 */

const queue = [];

export function addToQueue(event) {
  queue.push(event);
}

export function flushQueue(handler) {
  while (queue.length) {
    const event = queue.shift();
    handler(event);
  }
}

export function getQueue() {
  return queue;
}

