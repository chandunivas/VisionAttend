/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, useState, useEffect } from "react";
import { Camera, MapPin, AlertCircle, RefreshCw, CheckCircle, Sparkles } from "lucide-react";
import { motion } from "motion/react";

const LIVENESS_CHALLENGES = [
  { id: "smile", label: "Smile Widely", instruction: "Smile widely showing your teeth" },
  { id: "blink", label: "Close Eyes / Blink", instruction: "Close your eyes or blink for the photo" },
  { id: "tilt_left", label: "Tilt Head Left", instruction: "Tilt your head slightly to your left side" },
  { id: "tilt_right", label: "Tilt Head Right", instruction: "Tilt your head slightly to your right side" },
  { id: "raise_eyebrows", label: "Raise Eyebrows", instruction: "Raise your eyebrows as if surprised" },
  { id: "open_mouth", label: "Open Mouth Slightly", instruction: "Open your mouth slightly" }
];

interface CameraViewProps {
  onCapture: (
    base64Image: string, 
    gps: { latitude: number; longitude: number; accuracy?: number; bypassed?: boolean },
    livenessChallenge?: string
  ) => void;
  buttonLabel?: string;
  skipGps?: boolean;
  allowBypass?: boolean;
}

export default function CameraView({ 
  onCapture, 
  buttonLabel = "Capture Selfie with GPS", 
  skipGps = false,
  allowBypass = true
}: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsData, setGpsData] = useState<{ latitude: number; longitude: number; accuracy?: number; bypassed?: boolean } | null>(() => ({
    latitude: 17.94308, // Default main campus coordinates
    longitude: 83.4222,
    accuracy: 500,
    bypassed: true
  }));
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isCaptured, setIsCaptured] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  // Pick random liveness challenge
  const [challenge, setChallenge] = useState(() => 
    LIVENESS_CHALLENGES[Math.floor(Math.random() * LIVENESS_CHALLENGES.length)]
  );

  const rotateChallenge = () => {
    let next;
    do {
      next = LIVENESS_CHALLENGES[Math.floor(Math.random() * LIVENESS_CHALLENGES.length)];
    } while (next.id === challenge.id);
    setChallenge(next);
  };

  // Initialize Camera Stream
  useEffect(() => {
    async function enableCamera() {
      try {
        setCameraError(null);
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
          audio: false,
        });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err: any) {
        console.warn("Camera access warning:", err?.message || err);
        setCameraError(
          "Camera permission was denied or is unavailable. Please ensure camera access is enabled in your browser settings."
        );
      }
    }

    enableCamera();
    if (!skipGps) {
      requestGpsLocation();
    } else {
      setGpsLoading(false);
      setGpsData({
        latitude: 0,
        longitude: 0,
        accuracy: 0,
        bypassed: true
      });
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [skipGps]);

  // Sync video source when stream updates
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Request GPS Coordinates
  const requestGpsLocation = () => {
    if (!navigator.geolocation) {
      setGpsError("Geolocation is not supported by your browser. Automatically applied campus default GPS bypass.");
      setGpsData({
        latitude: 17.94308, // Default main campus coordinates
        longitude: 83.4222,
        accuracy: 500,
        bypassed: true
      });
      return;
    }

    setGpsLoading(true);
    setGpsError(null);

    // Try fast lock (almost instantaneous via cell/Wi-Fi/network IP)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGpsData({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          bypassed: false
        });
        setGpsLoading(false);
      },
      (error) => {
        console.warn("GPS lock failed, automatically using indoor campus bypass:", error?.message || error);
        setGpsLoading(false);
        switch (error.code) {
          case 1: // PERMISSION_DENIED
            setGpsError("GPS Location permission denied. Defaulted to campus indoor signal bypass.");
            break;
          case 2: // POSITION_UNAVAILABLE
            setGpsError("Location information is unavailable on your device. Defaulted to campus indoor signal bypass.");
            break;
          case 3: // TIMEOUT
            setGpsError("Location request timed out. Defaulted to campus indoor signal bypass.");
            break;
          default:
            setGpsError("An unknown GPS error occurred. Defaulted to campus indoor signal bypass.");
        }
        // Automatically apply the GPS bypass fallback so the user is never locked out of submitting
        setGpsData({
          latitude: 17.94308, // Default main campus coordinates
          longitude: 83.4222,
          accuracy: 500,
          bypassed: true
        });
      },
      { enableHighAccuracy: false, timeout: 2500, maximumAge: 30000 }
    );
  };

  // Handle manual bypass for GPS issues (graceful signal handling)
  const handleGpsBypass = () => {
    setGpsData({
      latitude: 17.94308, // Default main campus coordinates
      longitude: 83.4222,
      accuracy: 500,
      bypassed: true
    });
    setGpsError(null);
  };

  // Capture Photo From Video
  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    if (!context) return;

    // Downscale video frame for lightweight storage and bandwidth optimization
    const maxDimension = 360;
    let width = video.videoWidth || 640;
    let height = video.videoHeight || 480;

    if (width > height) {
      if (width > maxDimension) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      }
    } else {
      if (height > maxDimension) {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
    }

    canvas.width = width;
    canvas.height = height;

    // Flip horizontally for natural mirror selfie look
    context.translate(canvas.width, 0);
    context.scale(-1, 1);

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Reset transform
    context.setTransform(1, 0, 0, 1, 0, 0);

    const base64 = canvas.toDataURL("image/jpeg", 0.5);
    setCapturedImage(base64);
    setIsCaptured(true);

    if (gpsData) {
      onCapture(base64, gpsData, challenge.instruction);
    }
  };

  const handleRetake = () => {
    setIsCaptured(false);
    setCapturedImage(null);
    rotateChallenge();
    requestGpsLocation();
  };

  return (
    <div className="space-y-4">
      {/* Liveness Challenge Prompt */}
      <div className="rounded-2xl bg-indigo-50 border border-indigo-150 p-3.5 flex items-center justify-between text-slate-800">
        <div className="flex-1">
          <p className="text-[10px] text-indigo-600 font-black uppercase tracking-wider flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5 animate-pulse text-indigo-600" />
            Anti-Spoof Liveness Action
          </p>
          <p className="text-xs font-extrabold text-slate-800 mt-0.5">
            {challenge.instruction}
          </p>
        </div>
        {!isCaptured && (
          <button
            type="button"
            onClick={rotateChallenge}
            className="rounded-lg bg-white border border-slate-200 px-2 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50 cursor-pointer transition active:scale-95 shadow-sm"
          >
            Change Action
          </button>
        )}
      </div>

      {/* Visual stage viewport */}
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl">
        {!isCaptured ? (
          <>
            {cameraError ? (
              <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                <AlertCircle className="mb-3 h-12 w-12 text-red-500" />
                <p className="text-sm font-medium text-slate-300">{cameraError}</p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="mt-4 flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500"
                >
                  <RefreshCw className="h-4 w-4" /> Reload Permissions
                </button>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover -scale-x-100"
                />
                
                {/* Biometric Scan HUD Overlay */}
                {stream && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    {/* Horizontal scanning bar */}
                    <div className="absolute left-0 w-full h-1 bg-indigo-500/80 shadow-[0_0_12px_#4f46e5] animate-scan opacity-70" />

                    {/* Target Face Guide Oval */}
                    <div className="relative w-48 h-60 border border-dashed border-indigo-400/40 rounded-[100px] flex items-center justify-center">
                      {/* Corner brackets */}
                      <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-indigo-400" />
                      <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-indigo-400" />
                      <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-indigo-400" />
                      <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-indigo-400" />

                      {/* Glowing Facial Landmarks Grid / Tracking Nodes */}
                      <div className="absolute top-[25%] left-[30%] w-2 h-2 rounded-full bg-indigo-400 animate-pulse-node shadow-[0_0_6px_#818cf8]" />
                      <div className="absolute top-[25%] right-[30%] w-2 h-2 rounded-full bg-indigo-400 animate-pulse-node shadow-[0_0_6px_#818cf8]" />
                      <div className="absolute top-[45%] left-[48%] w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_4px_#34d399]" />
                      <div className="absolute top-[65%] left-[38%] w-2 h-2 rounded-full bg-indigo-400 animate-pulse-node shadow-[0_0_6px_#818cf8]" />
                      <div className="absolute top-[65%] right-[38%] w-2 h-2 rounded-full bg-indigo-400 animate-pulse-node shadow-[0_0_6px_#818cf8]" />
                      <div className="absolute top-[52%] left-[48%] w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_4px_#34d399]" />
                      <div className="absolute top-[75%] left-[49%] w-2 h-2 rounded-full bg-indigo-400 animate-pulse-node shadow-[0_0_6px_#818cf8]" />

                      {/* Connecting virtual wire lines */}
                      <svg className="absolute inset-0 w-full h-full opacity-30 stroke-indigo-400 stroke-[0.5] fill-none">
                        <path d="M 96 75 L 68 60 M 96 75 L 124 60 M 96 75 L 96 108 M 96 108 L 73 156 M 96 108 L 119 156 M 73 156 L 96 180 L 119 156" />
                      </svg>

                      {/* Scanning status banner */}
                      <div className="absolute bottom-6 bg-slate-900/90 border border-indigo-500/30 px-2.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest text-indigo-400 animate-pulse">
                        Facial Landmark Lock
                      </div>
                    </div>

                    {/* Circular Radar Overlay */}
                    <div className="absolute bottom-4 right-4 w-12 h-12 rounded-full border border-indigo-500/20 flex items-center justify-center opacity-60">
                      <div className="absolute w-full h-full rounded-full border border-dashed border-indigo-500/40 animate-spin-slow" />
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          capturedImage && (
            <img
              src={capturedImage}
              alt="Captured profile"
              className="h-full w-full object-cover"
            />
          )
        )}

        {/* Live overlay HUD */}
        <div className="absolute top-3 left-3 flex flex-wrap gap-2">
          {!skipGps && (
            gpsLoading ? (
              <span className="flex items-center gap-1.5 rounded-full bg-amber-950/80 px-3 py-1 text-[11px] font-medium text-amber-400 backdrop-blur border border-amber-500/30">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Acquiring Precise GPS...
              </span>
            ) : gpsData ? (
              gpsData.bypassed ? (
                <span className="flex items-center gap-1.5 rounded-full bg-amber-950/90 px-3 py-1 text-[11px] font-extrabold text-amber-400 backdrop-blur border border-amber-500/30">
                  <MapPin className="h-3 w-3" />
                  GPS: Signal Override (Indoor)
                </span>
              ) : (
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-950/80 px-3 py-1 text-[11px] font-medium text-emerald-400 backdrop-blur border border-emerald-500/30">
                  <MapPin className="h-3 w-3 animate-bounce" />
                  GPS Active: {gpsData.latitude.toFixed(5)}, {gpsData.longitude.toFixed(5)}
                </span>
              )
            ) : gpsError ? (
              <span className="flex items-center gap-1.5 rounded-full bg-red-950/80 px-3 py-1 text-[11px] font-medium text-red-400 backdrop-blur border border-red-500/30">
                <AlertCircle className="h-3 w-3" />
                GPS Blocked
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full bg-amber-950/80 px-3 py-1 text-[11px] font-medium text-amber-400 backdrop-blur border border-amber-500/30">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Acquiring GPS Lock...
              </span>
            )
          )}

          {isCaptured && (
            <span className="flex items-center gap-1.5 rounded-full bg-indigo-950/80 px-3 py-1 text-[11px] font-medium text-indigo-400 backdrop-blur border border-indigo-500/30">
              <CheckCircle className="h-3 w-3" /> Photo Locked
            </span>
          )}
        </div>

        {/* Indoor GPS warning banner overlay (Only for verification check-in mode) */}
        {!isCaptured && buttonLabel === "Verify GPS Proximity & Check-In" && gpsData?.bypassed && (
          <div className="absolute bottom-3 left-3 right-3 bg-red-950/95 border border-red-500/40 p-3 rounded-xl flex items-center justify-between gap-3 text-white backdrop-blur shadow-xl pointer-events-auto z-10 animate-pulse">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <div className="text-left">
                <p className="text-[10px] font-black uppercase text-red-400 tracking-wider">Indoor Location Detected</p>
                <p className="text-[11px] text-slate-300 font-bold leading-tight">
                  Attendance requires direct outdoor GPS coordinates (latitude & longitude). Please step outside or to a window and click "Try Again".
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                requestGpsLocation();
              }}
              className="rounded-lg bg-red-600 hover:bg-red-500 px-3 py-1.5 text-[10px] font-bold text-white transition active:scale-95 flex items-center gap-1 shrink-0 cursor-pointer shadow-sm"
            >
              <RefreshCw className="h-3 w-3 animate-spin-slow" /> Try Again
            </button>
          </div>
        )}
      </div>

      {/* Hidden canvas for capturing frames */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Action buttons */}
      <div className="flex flex-col gap-2">
        {!isCaptured ? (
          <>
            <button
              type="button"
              onClick={handleCapture}
              disabled={!!cameraError || (!skipGps && buttonLabel === "Verify GPS Proximity & Check-In" && gpsData?.bypassed && !allowBypass)}
              className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white shadow-lg transition-all ${
                cameraError || (!skipGps && buttonLabel === "Verify GPS Proximity & Check-In" && gpsData?.bypassed && !allowBypass)
                  ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
                  : "bg-indigo-600 hover:bg-indigo-500 cursor-pointer hover:shadow-indigo-500/25 active:scale-[0.98]"
              }`}
            >
              <Camera className="h-4 w-4" />
              {!skipGps && buttonLabel === "Verify GPS Proximity & Check-In" && gpsData?.bypassed && !allowBypass
                ? "GPS Signal Required (Indoor Blocked)"
                : buttonLabel}
            </button>

            {!skipGps && (!gpsData || gpsData.bypassed === false) && !cameraError && buttonLabel !== "Verify GPS Proximity & Check-In" && (
              <button
                type="button"
                onClick={handleGpsBypass}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-50 hover:bg-amber-100 py-2.5 text-xs font-bold text-amber-700 border border-amber-250 transition active:scale-95 cursor-pointer"
              >
                <MapPin className="h-4 w-4 shrink-0 text-amber-600" />
                Bypass GPS Lock (Poor Signal/Indoor Override)
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={handleRetake}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 py-3 text-sm font-semibold text-slate-300 border border-slate-700 transition cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" />
            {skipGps ? "Retake Photo" : "Retake Photo & Refresh GPS Location"}
          </button>
        )}

        {!skipGps && gpsError && (
          <div className="flex flex-col gap-2 rounded-xl bg-red-950/30 border border-red-500/20 p-3 text-[11px] text-red-300">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <div>
                <p className="font-semibold">GPS Location Missing</p>
                <p>{gpsError}</p>
                <button
                  type="button"
                  onClick={requestGpsLocation}
                  className="mt-1 font-bold text-red-400 hover:underline flex items-center gap-1"
                >
                  <RefreshCw className="h-2.5 w-2.5" /> Try again
                </button>
              </div>
            </div>

            {buttonLabel !== "Verify GPS Proximity & Check-In" && (
              <button
                type="button"
                onClick={handleGpsBypass}
                className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-950/40 hover:bg-amber-950/60 py-2 text-amber-300 border border-amber-500/30 transition text-[10px] font-bold cursor-pointer"
              >
                <MapPin className="h-3 w-3 text-amber-400" /> Bypassed Clock-In (Proceed with indoor signal bypass)
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
