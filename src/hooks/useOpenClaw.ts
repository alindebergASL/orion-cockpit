import { useEffect, useMemo, useRef, useState } from 'react';
import { OpenClawClient } from '../lib/openclaw';
import { OPENCLAW_URL, OPENCLAW_TOKEN } from '../config';

export function useOpenClaw() {
  const [connected, setConnected] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(null);

  const client = useMemo(
    () => new OpenClawClient(OPENCLAW_URL, OPENCLAW_TOKEN),
    [],
  );

  useEffect(() => {
    const check = async () => setConnected(await client.ping());
    check();
    intervalRef.current = setInterval(check, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [client]);

  return { client, connected };
}
