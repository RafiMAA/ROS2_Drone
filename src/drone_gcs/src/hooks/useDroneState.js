// ─────────────────────────────────────────────────────────
// useDroneState.js — Subscribes to MAVROS state
// ─────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { Topic } from 'roslib';
import { TOPICS } from '../config/rosConfig';

/**
 * Subscribes to /mavros/state and returns armed status,
 * flight mode, and system connection state.
 *
 * @param {ROSLIB.Ros | null} ros
 * @returns {{ armed: boolean, mode: string, guided: boolean, connected: boolean }}
 */
export function useDroneState(ros) {
  const [state, setState] = useState({
    armed: false,
    mode: 'UNKNOWN',
    guided: false,
    connected: false,
  });

  useEffect(() => {
    if (!ros) return;

    const topic = new Topic({
      ros,
      name: TOPICS.STATE.name,
      messageType: TOPICS.STATE.messageType,
      throttle_rate: 500,
    });

    const callback = (msg) => {
      setState({
        armed: msg.armed,
        mode: msg.mode,
        guided: msg.guided,
        connected: msg.connected,
      });
    };

    topic.subscribe(callback);

    return () => {
      topic.unsubscribe(callback);
    };
  }, [ros]);

  return state;
}

export default useDroneState;
