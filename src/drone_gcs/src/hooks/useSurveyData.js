// ─────────────────────────────────────────────────────────
// useSurveyData.js — Hook for bathymetric survey data
// ─────────────────────────────────────────────────────────
// Subscribes to survey progress, per-point measurements,
// and final results (including volume data) from the
// bathymetric_survey_node via rosbridge.
// ─────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { Topic } from 'roslib';
import { TOPICS } from '../config/rosConfig';

/**
 * useSurveyData — Subscribes to bathymetric survey ROS2 topics.
 *
 * @param {ROSLIB.Ros | null} ros
 * @returns {{
 *   progress: { state: string, current_wp: number, total_wps: number, percent: number, measured: number } | null,
 *   surveyPoints: Array<{ x: number, y: number, type: string, depth?: number, elevation?: number }>,
 *   volumeData: Object | null,
 *   surveyActive: boolean,
 *   clearSurveyData: () => void,
 * }}
 */
export function useSurveyData(ros) {
  const [progress, setProgress] = useState(null);
  const [surveyPoints, setSurveyPoints] = useState([]);
  const [volumeData, setVolumeData] = useState(null);

  const surveyActive = progress !== null &&
    progress.state !== 'IDLE' &&
    progress.state !== 'COMPLETE' &&
    progress.state !== 'ABORTED';

  const clearSurveyData = useCallback(() => {
    setProgress(null);
    setSurveyPoints([]);
    setVolumeData(null);
  }, []);

  useEffect(() => {
    if (!ros) return;

    // ── Progress topic ──
    const progressTopic = new Topic({
      ros,
      name: TOPICS.SURVEY_PROGRESS.name,
      messageType: TOPICS.SURVEY_PROGRESS.messageType,
      throttle_rate: 200, // 5Hz max
    });

    const progressCb = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        setProgress(data);
      } catch (e) {
        console.error('[useSurveyData] Bad progress JSON:', e);
      }
    };
    progressTopic.subscribe(progressCb);

    // ── Per-point measurement topic ──
    const pointTopic = new Topic({
      ros,
      name: TOPICS.SURVEY_POINT.name,
      messageType: TOPICS.SURVEY_POINT.messageType,
    });

    const pointCb = (msg) => {
      try {
        const point = JSON.parse(msg.data);
        setSurveyPoints((prev) => [...prev, point]);
      } catch (e) {
        console.error('[useSurveyData] Bad point JSON:', e);
      }
    };
    pointTopic.subscribe(pointCb);

    // ── Final results topic (includes volume data) ──
    const resultsTopic = new Topic({
      ros,
      name: TOPICS.SURVEY_RESULTS.name,
      messageType: TOPICS.SURVEY_RESULTS.messageType,
    });

    const resultsCb = (msg) => {
      try {
        const results = JSON.parse(msg.data);
        if (results.volume) {
          setVolumeData(results.volume);
        }
        // Also update all points from the full results
        if (results.points) {
          setSurveyPoints(results.points);
        }
      } catch (e) {
        console.error('[useSurveyData] Bad results JSON:', e);
      }
    };
    resultsTopic.subscribe(resultsCb);

    return () => {
      progressTopic.unsubscribe(progressCb);
      pointTopic.unsubscribe(pointCb);
      resultsTopic.unsubscribe(resultsCb);
    };
  }, [ros]);

  return { progress, surveyPoints, volumeData, surveyActive, clearSurveyData };
}

export default useSurveyData;
