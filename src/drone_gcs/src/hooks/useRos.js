// ─────────────────────────────────────────────────────────
// useRos.js — ROSLIB.Ros connection manager hook
// ─────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from 'react';
import { Ros } from 'roslib';
import { ROS_CONFIG } from '../config/rosConfig';

/**
 * Manages the roslibjs WebSocket connection lifecycle.
 * Auto-connects on mount and reconnects on disconnect.
 *
 * @returns {{ ros: ROSLIB.Ros | null, connected: boolean }}
 */
export function useRos() {
  const [connected, setConnected] = useState(false);
  const rosRef = useRef(null);
  const reconnectTimerRef = useRef(null);

  const connect = useCallback(() => {
    // Clean up any existing connection
    if (rosRef.current) {
      try { rosRef.current.close(); } catch (e) { /* ignore */ }
    }

    const ros = new Ros({ url: ROS_CONFIG.url });

    ros.on('connection', () => {
      console.log('[ROS] Connected to', ROS_CONFIG.url);
      setConnected(true);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    });

    ros.on('error', (error) => {
      console.error('[ROS] Connection error:', error);
    });

    ros.on('close', () => {
      console.warn('[ROS] Disconnected. Reconnecting in', ROS_CONFIG.reconnectInterval, 'ms...');
      setConnected(false);
      // Auto-reconnect
      if (!reconnectTimerRef.current) {
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          connect();
        }, ROS_CONFIG.reconnectInterval);
      }
    });

    rosRef.current = ros;
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (rosRef.current) {
        try { rosRef.current.close(); } catch (e) { /* ignore */ }
      }
    };
  }, [connect]);

  return { ros: rosRef.current, connected };
}

export default useRos;
