export function acquireSingleFlight(activeKeys: Set<string>, key: string) {
  if (activeKeys.has(key)) {
    return false;
  }

  activeKeys.add(key);
  return true;
}

export function releaseSingleFlight(activeKeys: Set<string>, key: string) {
  activeKeys.delete(key);
}

