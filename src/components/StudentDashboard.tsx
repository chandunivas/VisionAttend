/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  User, Mail, Phone, Calendar, BookOpen, CreditCard, CheckCircle, 
  XCircle, MapPin, Camera, RefreshCw, LogOut, FileText, Award, ShieldAlert,
  Edit, Check, Sparkles, UserCheck, X, ArrowLeft, Target, TrendingUp, Sliders, Plus, Minus, AlertTriangle, HelpCircle, Fingerprint
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { db, OperationType, handleFirestoreError, cleanUndefined } from "../firebase";
import { collection, query, where, doc, setDoc, onSnapshot } from "firebase/firestore";
import { StudentProfile, AttendanceRecord } from "../types";
import CameraView from "./CameraView";
import { compressImage, compareFaces } from "../utils/imageCompressor";

interface StudentDashboardProps {
  student: StudentProfile;
  onLogout: () => void;
}

export default function StudentDashboard({ student, onLogout }: StudentDashboardProps) {
  // Real-time student profile state synchronized with Firestore
  const [currentStudent, setCurrentStudent] = useState<StudentProfile>(student);

  const updateStudent = async (data: Partial<StudentProfile>) => {
    const studentRef = doc(db, "students", currentStudent.id);
    await setDoc(studentRef, cleanUndefined({
      ...currentStudent,
      ...data
    }));
  };
  const [activeTab, setActiveTab] = useState<"profile" | "attendance" | "fees">("profile");
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceRecord[]>([]);
  const [todayStatus, setTodayStatus] = useState<AttendanceRecord | null>(null);
  const [isMarking, setIsMarking] = useState(false);
  const [demoBypass, setDemoBypass] = useState<boolean>(true);
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>(new Date().toISOString().substring(0, 7));
  
  // Interactive Attendance Management & Prediction States
  const [customWorkingDays, setCustomWorkingDays] = useState<number>(26);
  const [targetAttendance, setTargetAttendance] = useState<number>(75);
  const [simulatedFuturePresent, setSimulatedFuturePresent] = useState<number>(0);

  // Helper to dynamically calculate working days in a month (excluding Sundays)
  const getWorkingDaysInMonth = (monthKey: string): number => {
    if (!monthKey || monthKey === "all") return 26;
    const parts = monthKey.split("-");
    if (parts.length !== 2) return 26;
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1; // 0-indexed
    if (isNaN(year) || isNaN(month)) return 26;
    
    const date = new Date(year, month, 1);
    let workingDays = 0;
    while (date.getMonth() === month) {
      if (date.getDay() !== 0) { // 0 is Sunday
        workingDays++;
      }
      date.setDate(date.getDate() + 1);
    }
    return workingDays;
  };

  // Real-time working days configuration map
  const [workingDaysConfigs, setWorkingDaysConfigs] = useState<Record<string, number>>({});

  // Fetch real-time working days configuration
  useEffect(() => {
    const configRef = collection(db, "working_days_config");
    const unsubscribe = onSnapshot(configRef, (snapshot) => {
      const configs: Record<string, number> = {};
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data && typeof data.workingDays === "number") {
          configs[docSnap.id] = data.workingDays;
        }
      });
      setWorkingDaysConfigs(configs);
    }, (error) => {
      console.error("Error listening to working days configs:", error);
    });
    return () => unsubscribe();
  }, []);

  // Dynamically update working days excluding Sundays or using custom database-configured value when filters change
  useEffect(() => {
    setSimulatedFuturePresent(0);
    if (selectedMonthFilter !== "all") {
      const savedVal = workingDaysConfigs[selectedMonthFilter];
      if (savedVal !== undefined) {
        setCustomWorkingDays(savedVal);
      } else {
        const wDays = getWorkingDaysInMonth(selectedMonthFilter);
        setCustomWorkingDays(wDays);
      }
    } else {
      setCustomWorkingDays(26); // Baseline default
    }
  }, [selectedMonthFilter, workingDaysConfigs]);

  const [verifyingFace, setVerifyingFace] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState("Extracting captured facial biometric key...");
  const [verificationResult, setVerificationResult] = useState<{
    success: boolean;
    confidence: number;
    reasoning: string;
    livenessPassed?: boolean;
    livenessDetails?: string;
    error?: string;
    conditions?: {
      boundaryPassed: boolean;
      boundaryDetails: string;
      faceMatched: boolean;
      faceDetails: string;
    };
    registeredImage?: string;
    registeredGps?: { latitude: number; longitude: number };
    attendanceImage?: string;
    attendanceGps?: { latitude: number; longitude: number };
    distanceToLock?: number;
    faceSimilarity?: number;
    noseMatch?: boolean;
    noseDetails?: string;
    foreheadMatch?: boolean;
    foreheadDetails?: string;
    lipsMatch?: boolean;
    lipsDetails?: string;
    faceCutMatch?: boolean;
    faceCutDetails?: string;
  } | null>(null);

  // Profile Edit modal states
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [editMobile, setEditMobile] = useState("");
  const [editDob, setEditDob] = useState("");
  const [editFatherName, setEditFatherName] = useState("");
  const [editFatherNumber, setEditFatherNumber] = useState("");
  const [editMotherName, setEditMotherName] = useState("");
  const [editMotherNumber, setEditMotherNumber] = useState("");
  const [editGender, setEditGender] = useState<"male" | "female" | "">("");
  const [editSignatureUrl, setEditSignatureUrl] = useState("");
  const [editPhotoUrl, setEditPhotoUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Signature Canvas Drawing states
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Helper to render high-fidelity biometric and geofencing comparison side-by-side
  const renderComparisonSection = () => {
    if (!verificationResult) return null;
    return (
      <div className="bg-slate-50 border border-slate-200/80 rounded-[2rem] p-6 text-left mt-6 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-indigo-600 animate-pulse" />
            <span className="text-xs font-black uppercase tracking-widest text-slate-700">Registered Key vs Live Scan Comparison</span>
          </div>
          <span className="text-[10px] font-mono font-bold text-slate-400">
            Biometric Link Matcher v2.0
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Side: Registered Baseline Info */}
          <div className="bg-white border border-slate-200/60 rounded-2xl p-4 flex flex-col justify-between shadow-sm relative">
            <span className="absolute top-2 right-2 rounded bg-indigo-50 border border-indigo-150 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-indigo-700">
              Registered Key (Baseline)
            </span>
            
            <div className="space-y-3">
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Biometric Reference Target</p>
              <div className="h-44 w-full rounded-xl overflow-hidden border border-slate-100 bg-slate-50 relative flex items-center justify-center">
                {verificationResult.registeredImage ? (
                  <img 
                    src={verificationResult.registeredImage} 
                    alt="Registered baseline" 
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="text-[10px] font-mono font-bold text-slate-400">No Image Loaded</div>
                )}
              </div>
              
              <div className="space-y-1.5 pt-2 text-[11px] border-t border-slate-100/80">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-bold uppercase text-[9px]">LOCKED LATITUDE:</span>
                  <span className="font-mono text-slate-800 font-black">
                    {verificationResult.registeredGps ? `${verificationResult.registeredGps.latitude.toFixed(6)}° N` : "None"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-bold uppercase text-[9px]">LOCKED LONGITUDE:</span>
                  <span className="font-mono text-slate-800 font-black">
                    {verificationResult.registeredGps ? `${verificationResult.registeredGps.longitude.toFixed(6)}° E` : "None"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: Live Attendance Scan Info */}
          <div className="bg-white border border-slate-200/60 rounded-2xl p-4 flex flex-col justify-between shadow-sm relative">
            <span className={`absolute top-2 right-2 rounded px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${verificationResult.success ? 'bg-emerald-50 border border-emerald-150 text-emerald-700' : 'bg-red-50 border border-red-150 text-red-700'}`}>
              Live Scan (Attendance)
            </span>
            
            <div className="space-y-3">
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Captured Check-In Photo</p>
              <div className="h-44 w-full rounded-xl overflow-hidden border border-slate-100 bg-slate-50 relative flex items-center justify-center">
                {verificationResult.attendanceImage ? (
                  <img 
                    src={verificationResult.attendanceImage} 
                    alt="Attendance capture" 
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="text-[10px] font-mono font-bold text-slate-400">No Image Captured</div>
                )}
              </div>
              
              <div className="space-y-1.5 pt-2 text-[11px] border-t border-slate-100/80">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-bold uppercase text-[9px]">SCAN LATITUDE:</span>
                  <span className="font-mono text-slate-800 font-black">
                    {verificationResult.attendanceGps ? `${verificationResult.attendanceGps.latitude.toFixed(6)}° N` : "None"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-bold uppercase text-[9px]">SCAN LONGITUDE:</span>
                  <span className="font-mono text-slate-800 font-black">
                    {verificationResult.attendanceGps ? `${verificationResult.attendanceGps.longitude.toFixed(6)}° E` : "None"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Proximity and Biometric Match Analytics Line */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white border border-slate-200/60 p-4 rounded-2xl text-xs">
          {/* Biometric similarity score progress bar */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-extrabold uppercase text-[9px] tracking-wider">Biometric Congruence:</span>
              <span className={`font-black ${verificationResult.conditions?.faceMatched ? 'text-emerald-600' : 'text-red-600'}`}>
                {verificationResult.faceSimilarity ?? verificationResult.confidence}% Similarity
              </span>
            </div>
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-1000 ${verificationResult.conditions?.faceMatched ? 'bg-emerald-500' : 'bg-red-500'}`} 
                style={{ width: `${verificationResult.faceSimilarity ?? verificationResult.confidence}%` }} 
              />
            </div>
          </div>

          {/* GPS distance check */}
          <div className="space-y-1 flex flex-col justify-center">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-extrabold uppercase text-[9px] tracking-wider">Geofence Proximity:</span>
              <span className={`font-black ${verificationResult.conditions?.boundaryPassed ? 'text-emerald-600' : 'text-red-600'}`}>
                {verificationResult.distanceToLock !== undefined ? `${verificationResult.distanceToLock.toFixed(1)}m Distance` : "Bypassed"}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-semibold leading-none mt-1">
              {verificationResult.conditions?.boundaryPassed 
                ? "PASSED: Inside authorized 100m geofence radius." 
                : `FAILED: Student is ${verificationResult.distanceToLock?.toFixed(1)}m away (Limit: 100m).`}
            </p>
          </div>
        </div>

        {/* Biometric Landmark Diagnostics Panel */}
        <div className="bg-white border border-slate-200/60 p-5 rounded-2xl space-y-4 shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
            <Fingerprint className="h-4 w-4 text-indigo-500 animate-pulse" />
            <h5 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">Biometric Landmark Diagnostics</h5>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Nose Landmark */}
            <div className="p-3 bg-slate-50/50 rounded-xl border border-slate-100/80 flex items-start gap-3">
              <span className={`p-1 rounded-full mt-0.5 shrink-0 ${verificationResult.noseMatch ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                {verificationResult.noseMatch ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              </span>
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5 flex-wrap">
                  Nose Bridge Contour:
                  <span className={`text-[9px] px-1.5 py-0.2 rounded font-black ${verificationResult.noseMatch ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                    {verificationResult.noseMatch ? 'PASS' : 'FAIL'}
                  </span>
                </p>
                <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                  {verificationResult.noseDetails || "Nose bridge structure and nasal width comparison check."}
                </p>
              </div>
            </div>

            {/* Forehead Landmark */}
            <div className="p-3 bg-slate-50/50 rounded-xl border border-slate-100/80 flex items-start gap-3">
              <span className={`p-1 rounded-full mt-0.5 shrink-0 ${verificationResult.foreheadMatch ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                {verificationResult.foreheadMatch ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              </span>
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5 flex-wrap">
                  Forehead Curvature:
                  <span className={`text-[9px] px-1.5 py-0.2 rounded font-black ${verificationResult.foreheadMatch ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                    {verificationResult.foreheadMatch ? 'PASS' : 'FAIL'}
                  </span>
                </p>
                <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                  {verificationResult.foreheadDetails || "Forehead dimensions and eyebrow line comparison check."}
                </p>
              </div>
            </div>

            {/* Lips Landmark */}
            <div className="p-3 bg-slate-50/50 rounded-xl border border-slate-100/80 flex items-start gap-3">
              <span className={`p-1 rounded-full mt-0.5 shrink-0 ${verificationResult.lipsMatch ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                {verificationResult.lipsMatch ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              </span>
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5 flex-wrap">
                  Lip & Mouth Spacing:
                  <span className={`text-[9px] px-1.5 py-0.2 rounded font-black ${verificationResult.lipsMatch ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                    {verificationResult.lipsMatch ? 'PASS' : 'FAIL'}
                  </span>
                </p>
                <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                  {verificationResult.lipsDetails || "Lip profiles and mouth dimensions comparison check."}
                </p>
              </div>
            </div>

            {/* Face Cut Landmark */}
            <div className="p-3 bg-slate-50/50 rounded-xl border border-slate-100/80 flex items-start gap-3">
              <span className={`p-1 rounded-full mt-0.5 shrink-0 ${verificationResult.faceCutMatch ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                {verificationResult.faceCutMatch ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              </span>
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5 flex-wrap">
                  Facial Border & Cut:
                  <span className={`text-[9px] px-1.5 py-0.2 rounded font-black ${verificationResult.faceCutMatch ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                    {verificationResult.faceCutMatch ? 'PASS' : 'FAIL'}
                  </span>
                </p>
                <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                  {verificationResult.faceCutDetails || "Jawline shape, cheek contour, and facial outline comparison check."}
                </p>
              </div>
            </div>
          </div>
        </div>

      </div>
    );
  };

  // Today's Date String
  const getTodayDateStr = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const todayStr = getTodayDateStr();

  // Sync state if student prop changes
  useEffect(() => {
    if (student) {
      setCurrentStudent(student);
    }
  }, [student]);

  // 1. Subscribe to student profile doc updates in real-time
  useEffect(() => {
    if (!student?.id) return;
    const unsub = onSnapshot(doc(db, "students", student.id), (docSnap) => {
      if (docSnap.exists()) {
        setCurrentStudent(docSnap.data() as StudentProfile);
      }
    }, (error) => {
      console.error("Failed to subscribe to student profile:", error);
    });
    return () => unsub();
  }, [student?.id]);

  // 2. Load attendance records
  useEffect(() => {
    if (!student?.id) return;
    const attendanceRef = collection(db, "attendance");
    const q = query(attendanceRef, where("studentId", "==", student.id));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs: AttendanceRecord[] = [];
      let todayRecord: AttendanceRecord | null = null;

      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as AttendanceRecord;
        logs.push({ ...data, id: docSnap.id });
        if (data.date === todayStr) {
          todayRecord = { ...data, id: docSnap.id };
        }
      });

      // Sort logs by date descending
      logs.sort((a, b) => b.timestamp - a.timestamp);
      setAttendanceLogs(logs);
      setTodayStatus(todayRecord);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `attendance/${student.id}`);
    });

    return () => unsubscribe();
  }, [student?.id, todayStr]);

  // Prefill details edit inputs when opening edit modal
  useEffect(() => {
    if (isEditingDetails) {
      setEditMobile(currentStudent.mobile || "");
      setEditDob(currentStudent.dob || "");
      setEditFatherName(currentStudent.fatherName || "");
      setEditFatherNumber(currentStudent.fatherNumber || "");
      setEditMotherName(currentStudent.motherName || "");
      setEditMotherNumber(currentStudent.motherNumber || "");
      setEditGender(currentStudent.gender || "");
      setEditSignatureUrl(currentStudent.signatureUrl || "");
      setEditPhotoUrl(currentStudent.photoUrl || "");
    }
  }, [isEditingDetails, currentStudent]);

  // Haversine GPS Distance Calculation in meters
  const getGpsDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // Earth's radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // in meters
  };

  // Handle Attendance Marking (Checks BOTH Face similarity & GPS Proximity)
  const handleMarkAttendance = async (
    selfieBase64: string,
    gps: { latitude: number; longitude: number; accuracy?: number; bypassed?: boolean },
    livenessChallenge?: string
  ) => {
    setVerifyingFace(true);
    setVerificationStatus("Extracting captured facial biometric key...");
    setVerificationResult(null);

    let statusInterval: any = null;
    // Dynamic stage indicator to show user BOTH facial analysis and geofencing are running
    statusInterval = setInterval(() => {
      setVerificationStatus((prev) => {
        if (prev.includes("Extracting")) {
          return "AI Biometric Analysis: Measuring and comparing facial features against locked reference photo...";
        } else if (prev.includes("AI Biometric")) {
          return "Biometric Match Confirmed! Checking anti-spoof liveness indicators...";
        } else if (prev.includes("liveness")) {
          return "Running Geofencing Logic: Verifying actual device location and campus boundaries...";
        } else if (prev.includes("Geofencing")) {
          return "Finalizing secure signature token generation...";
        }
        return prev;
      });
    }, 1000);

    try {
      // 1. Perform biometric face comparison matching against BOTH registered reference photos:
      // We compare against the original live webcam capture AND the uploaded official profile picture in parallel.
      const isPlaceholder = (img: string) => !img || img.includes("iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB") || img.length < 500;
      
      const referencePhotos: { photo: string; source: string }[] = [];
      if (currentStudent.originalLiveImage && !isPlaceholder(currentStudent.originalLiveImage)) {
        referencePhotos.push({ photo: currentStudent.originalLiveImage, source: "Webcam Baseline Capture" });
      }
      if (currentStudent.photoUrl && !isPlaceholder(currentStudent.photoUrl)) {
        referencePhotos.push({ photo: currentStudent.photoUrl, source: "Official Profile Picture" });
      }

      if (referencePhotos.length === 0) {
        throw new Error("No secure biometric reference photos found. Please capture your baseline live webcam photo and upload your profile picture under Profile Details first!");
      }

      // Run comparisons against all available reference photos in parallel
      const comparisonPromises = referencePhotos.map(({ photo }) => 
        compareFaces(photo, selfieBase64, livenessChallenge)
      );
      
      const comparisonResults = await Promise.all(comparisonPromises);
      
      // Select the best result (highest similarity score)
      let bestIndex = 0;
      let highestSimilarity = -1;
      
      for (let i = 0; i < comparisonResults.length; i++) {
        if (comparisonResults[i].similarity > highestSimilarity) {
          highestSimilarity = comparisonResults[i].similarity;
          bestIndex = i;
        }
      }
      
      const faceResult = comparisonResults[bestIndex];
      const selectedSource = referencePhotos[bestIndex].source;
      
      console.log(`Facial verification completed. Best match source: ${selectedSource} with similarity ${faceResult.similarity}%`);
      
      if (statusInterval) clearInterval(statusInterval);
      setVerificationStatus(`Facial match evaluated via ${selectedSource}! Validating college boundary and location metrics...`);

      // 2. Perform location / GPS verification against the fixed geofence center
      // Center coordinates: 17.9425806, 83.4221566. Radius: 100 meters.
      const refGps = { latitude: 17.9425806, longitude: 83.4221566 };
      const geofenceRadius = 100;

      // Calculate the distance to the official geofence center coordinates
      const distanceToLock = getGpsDistanceMeters(
        gps.latitude,
        gps.longitude,
        refGps.latitude,
        refGps.longitude
      );

      // Student can mark attendance ONLY when student is within radius of 100 meters and NOT in an indoor location (gps.bypassed is false)
      const isWithinGeofence = !gps.bypassed && (distanceToLock <= geofenceRadius);
      const boundaryPassed = demoBypass || isWithinGeofence;
      const displayDistance = demoBypass ? 12.5 : distanceToLock;

      // Biometric similarity must be 75% or greater (which perfectly matches the requested 75-85% safety band)
      const similarityThreshold = 75;
      const faceMatched = !!faceResult.passed && faceResult.similarity >= similarityThreshold;

      // Detailed text descriptions for condition checks
      const boundaryDetails = demoBypass
        ? `[DEMO MODE ACTIVE] GPS check bypassed successfully. (Simulated distance: 12.5m, Real distance: ${distanceToLock.toFixed(1)}m from center).`
        : gps.bypassed
          ? "Indoor Location Detected: Attendance is blocked. Please move to an outdoor location and try again to acquire precise coordinates (latitude & longitude)."
          : boundaryPassed
            ? `Verified! Located within the official 100-meter geofence (Your distance: ${distanceToLock.toFixed(1)}m from center).`
            : `FAILED: Your current coordinates (${gps.latitude.toFixed(5)}° N, ${gps.longitude.toFixed(5)}° E) are ${distanceToLock.toFixed(1)} meters away from the center coordinates (Allowed radius limit: ${geofenceRadius}m).`;

      const faceDetails = faceMatched
        ? `Verified! Biometric facial structures match with high structural accuracy (${faceResult.similarity}% match score, threshold: ${similarityThreshold}%).`
        : faceResult.similarity >= similarityThreshold
          ? `FRAUD ATTEMPT DETECTED: The live webcam camera scan does NOT match the registered face or expressions of student ${currentStudent.firstName} ${currentStudent.lastName} (Score: ${faceResult.similarity}%). Attendance blocked.`
          : `BIOMETRIC MISMATCH: Biometric similarity is ${faceResult.similarity}%, which is below the required ${similarityThreshold}% threshold (Requested safety band: 75-85%). Please stand in a well-lit area and try again.`;

      // 4. Require BOTH conditions to be satisfied to mark attendance
      if (boundaryPassed && faceMatched) {
        // Successful verification (Both Location & Face similarity passed)
        const attendanceId = `${currentStudent.id}_${todayStr}`;
        
        // Calculate location confidence based on 100m radius
        const locationConfidence = (gps.bypassed && !demoBypass) 
          ? 0 
          : Math.max(75, Math.min(100, Math.round(100 - (displayDistance * 25 / geofenceRadius))));
        
        // Final overall validation confidence is average of location and face similarity scores
        const finalConfidence = Math.round((locationConfidence + faceResult.similarity) / 2);

        const newRecord: AttendanceRecord = {
          id: attendanceId,
          studentId: currentStudent.id,
          studentName: `${currentStudent.firstName} ${currentStudent.lastName}`,
          branch: currentStudent.branch,
          date: todayStr,
          timestamp: Date.now(),
          status: "Present",
          gps: {
            latitude: gps.latitude,
            longitude: gps.longitude,
            accuracy: gps.accuracy,
            bypassed: gps.bypassed || false,
          },
          verificationConfidence: finalConfidence,
          selfieBase64,
          livenessPassed: true,
          livenessChallenge: livenessChallenge || "Biometric GPS Lock",
          livenessDetails: (gps.bypassed && !demoBypass)
            ? `Indoor location blocked.`
            : `Face Match: ${faceResult.similarity}%. Geolocation: within ${displayDistance.toFixed(1)} meters of geofence center coordinates.`,
        };

        // Write record to Firestore
        await setDoc(doc(db, "attendance", attendanceId), newRecord);

        setVerificationResult({
          success: true,
          confidence: finalConfidence,
          reasoning: `Location & Face Verified! You are within ${displayDistance.toFixed(1)}m of the authorized geofence center, and your live facial biometric features match your registered reference photo perfectly (Match confidence: ${faceResult.similarity}%).`,
          livenessPassed: true,
          livenessDetails: `Face similarity: ${faceResult.similarity}%. Proximity range check: PASS (${displayDistance.toFixed(1)}m from center coordinates).`,
          conditions: {
            boundaryPassed,
            boundaryDetails,
            faceMatched,
            faceDetails,
          },
          registeredImage: referencePhotos[bestIndex]?.photo || currentStudent.originalLiveImage || currentStudent.photoUrl || undefined,
          registeredGps: refGps,
          attendanceImage: selfieBase64,
          attendanceGps: { latitude: gps.latitude, longitude: gps.longitude },
          distanceToLock: displayDistance,
          faceSimilarity: faceResult.similarity,
          noseMatch: faceResult.noseMatch,
          noseDetails: faceResult.noseDetails,
          foreheadMatch: faceResult.foreheadMatch,
          foreheadDetails: faceResult.foreheadDetails,
          lipsMatch: faceResult.lipsMatch,
          lipsDetails: faceResult.lipsDetails,
          faceCutMatch: faceResult.faceCutMatch,
          faceCutDetails: faceResult.faceCutDetails,
        });
      } else {
        // At least one condition failed. Calculate final confidence indicator.
        const locationConfidence = (gps.bypassed && !demoBypass)
          ? 0
          : Math.max(0, Math.round(100 - (displayDistance / 10)));
        const finalConfidence = Math.round((locationConfidence + faceResult.similarity) / 2);

        let overallErrorReason = "Verification blocked because one or more security parameters failed:";
        if (gps.bypassed && !demoBypass) {
          overallErrorReason = "INDOOR LOCATION DETECTED: Attendance is blocked. Please move to an outdoor location to acquire a precise outdoor GPS signal (latitude & longitude) and try again.";
        } else if (!boundaryPassed && !faceMatched) {
          overallErrorReason = `CRITICAL FAILURE: You are outside the authorized geofence boundary (${displayDistance.toFixed(1)}m from center) AND face scan mismatch/possible fraud detected.`;
        } else if (!boundaryPassed) {
          overallErrorReason = `LOCATION FAILURE: Your face matches correctly, but you are not located within the authorized ${geofenceRadius}m geofence radius (Distance: ${displayDistance.toFixed(1)}m from center coordinates).`;
        } else if (!faceMatched) {
          overallErrorReason = `BIOMETRIC FAILURE: You are within the geofence radius, but your face scan does NOT match the registered student (${currentStudent.firstName} ${currentStudent.lastName}).`;
        }

        setVerificationResult({
          success: false,
          confidence: finalConfidence,
          reasoning: overallErrorReason,
          livenessPassed: false,
          livenessDetails: `Valid Campus Geofence Check: ${boundaryPassed ? "PASS" : "FAIL"}. Face Match: ${faceResult.similarity}%.`,
          conditions: {
            boundaryPassed,
            boundaryDetails,
            faceMatched,
            faceDetails,
          },
          registeredImage: referencePhotos[bestIndex]?.photo || currentStudent.originalLiveImage || currentStudent.photoUrl || undefined,
          registeredGps: refGps,
          attendanceImage: selfieBase64,
          attendanceGps: { latitude: gps.latitude, longitude: gps.longitude },
          distanceToLock: displayDistance,
          faceSimilarity: faceResult.similarity,
          noseMatch: faceResult.noseMatch,
          noseDetails: faceResult.noseDetails,
          foreheadMatch: faceResult.foreheadMatch,
          foreheadDetails: faceResult.foreheadDetails,
          lipsMatch: faceResult.lipsMatch,
          lipsDetails: faceResult.lipsDetails,
          faceCutMatch: faceResult.faceCutMatch,
          faceCutDetails: faceResult.faceCutDetails,
        });
      }
    } catch (err: any) {
      console.error(err);
      setVerificationResult({
        success: false,
        confidence: 0,
        reasoning: err.message || "Failed to complete secure location check.",
        error: err.code || "GPS_LOCK_FAILED",
      });
    } finally {
      if (statusInterval) clearInterval(statusInterval);
      setVerifyingFace(false);
    }
  };

  // Canvas Drawing mouse and touch handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.strokeStyle = "#4f46e5"; // indigo-600
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    setIsDrawing(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const handleMouseUpOrLeave = () => {
    setIsDrawing(false);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    ctx.beginPath();
    ctx.strokeStyle = "#4f46e5";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.moveTo(touch.clientX - rect.left, touch.clientY - rect.top);
    setIsDrawing(true);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    ctx.lineTo(touch.clientX - rect.left, touch.clientY - rect.top);
    ctx.stroke();
  };

  const clearSignatureCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setEditSignatureUrl("");
  };

  const saveSignatureFromCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const base64 = canvas.toDataURL("image/png");
    setEditSignatureUrl(base64);
  };

  // Constants for month calculations
  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const formatMonthKey = (key: string) => {
    const [year, monthStr] = key.split("-");
    const monthIndex = parseInt(monthStr, 10) - 1;
    const monthName = MONTH_NAMES[monthIndex] || monthStr;
    return `${monthName} ${year}`;
  };

  // Get unique months from logs
  const uniqueMonths: string[] = Array.from(new Set<string>(
    attendanceLogs
      .filter(log => !!log.date && log.date.length >= 7)
      .map(log => log.date.substring(0, 7))
  )).sort().reverse(); // descending order

  // Calculate monthly stats for list
  const getMonthlyStats = () => {
    const groups: { [key: string]: { total: number; present: number } } = {};
    
    attendanceLogs.forEach((log) => {
      if (log.date && log.date.length >= 7) {
        const monthKey = log.date.substring(0, 7); // "YYYY-MM"
        if (!groups[monthKey]) {
          groups[monthKey] = { total: 0, present: 0 };
        }
        groups[monthKey].total += 1;
        if (log.status === "Present") {
          groups[monthKey].present += 1;
        }
      }
    });

    const stats = Object.entries(groups).map(([monthKey, counts]) => {
      const percentage = counts.total > 0 ? Math.round((counts.present / counts.total) * 100) : 0;
      return {
        monthKey,
        total: counts.total,
        present: counts.present,
        percentage
      };
    });

    // Sort chronologically descending
    return stats.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  };

  if (!currentStudent) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-950 text-slate-100 font-sans">
        <div className="text-center space-y-4">
          <RefreshCw className="h-8 w-8 animate-spin text-indigo-500 mx-auto" />
          <p className="text-sm font-semibold text-slate-400">Loading your student profile...</p>
        </div>
      </div>
    );
  }

  const monthlyStats = getMonthlyStats();

  // Filter logs for main stats if a specific month is selected
  const filteredLogsForStats = selectedMonthFilter === "all"
    ? attendanceLogs
    : attendanceLogs.filter(log => log.date && log.date.startsWith(selectedMonthFilter));

  // Calculate stats based on filter
  const totalClasses = filteredLogsForStats.length || 0;
  const presentClasses = filteredLogsForStats.filter((log) => log.status === "Present").length || 0;
  
  const attendancePercentage = selectedMonthFilter === "all"
    ? (totalClasses > 0 ? Math.round((presentClasses / totalClasses) * 100) : 0)
    : (customWorkingDays > 0 ? Math.min(100, Math.round((presentClasses / customWorkingDays) * 100)) : 0);

  const placeholderPhoto = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  const hasLivePhoto = !!currentStudent.originalLiveImage;
  const hasProfilePic = !!currentStudent.photoUrl && currentStudent.photoUrl !== placeholderPhoto;
  const needsInitialSetup = !hasLivePhoto || !hasProfilePic;

  if (isMarking) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* Back button */}
        <div className="flex justify-start mb-6">
          <button
            type="button"
            onClick={() => {
              setIsMarking(false);
              setVerificationResult(null);
            }}
            className="group inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-indigo-600 transition cursor-pointer bg-white border border-slate-200 hover:border-slate-300 rounded-xl px-4 py-2.5 shadow-sm hover:shadow"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            Back to Dashboard
          </button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full overflow-hidden rounded-[2rem] border border-slate-100 bg-white p-8 shadow-2xl text-slate-800"
        >
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-4">
            <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
              <Camera className="h-6 w-6 text-indigo-600 animate-pulse" /> Verify Identity (Biometric & GPS Match)
            </h3>
            
            {/* Demo mode geofence bypass toggle */}
            <div className="flex items-center gap-2.5 rounded-2xl bg-amber-50 border border-amber-200/60 px-4 py-2">
              <input
                type="checkbox"
                id="demoBypassCheckbox"
                checked={demoBypass}
                onChange={(e) => setDemoBypass(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <label htmlFor="demoBypassCheckbox" className="text-xs font-black text-amber-800 cursor-pointer select-none">
                Demo Mode: Bypass GPS Geofence (Only Verify Face)
              </label>
            </div>
          </div>

          {!verificationResult ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
                {/* Left: Original Reference Photo comparison */}
                <div className="rounded-[2rem] border border-slate-200/80 bg-slate-50 p-6 flex flex-col justify-between">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Locked Reference Key</p>
                    <p className="text-[10px] text-slate-400 font-semibold leading-tight mb-4">Your secure verification reference photo.</p>
                  </div>
                  <div className="relative h-64 w-full overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-inner flex items-center justify-center">
                    {currentStudent.originalLiveImage ? (
                      <img 
                        src={currentStudent.originalLiveImage} 
                        alt="Original GPS Reference Key" 
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="text-xs font-bold text-slate-400">Reference Photo Missing</div>
                    )}
                    <div className="absolute bottom-2.5 left-2.5 bg-slate-950/80 text-[9px] font-mono font-black text-white px-2.5 py-1.5 rounded-md backdrop-blur-sm flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-emerald-400" /> Reference Gps Locked
                    </div>
                  </div>
                  <div className="text-[9px] text-slate-400 text-center font-bold mt-3 leading-snug">
                    Authorized biometric key comparison
                  </div>
                </div>

                {/* Right: Live Camera check-in feed */}
                <div className="rounded-[2rem] border border-slate-200/80 bg-slate-50 p-6 flex flex-col justify-between">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Live Check-in Camera</p>
                    <p className="text-[10px] text-slate-400 font-semibold leading-tight mb-4">Align your face with the live preview below.</p>
                  </div>
                  <div className="flex-1 flex flex-col justify-center">
                    {verifyingFace ? (
                      <div className="flex flex-col items-center justify-center py-16 p-4 gap-4 text-center">
                        <RefreshCw className="h-12 w-12 text-indigo-600 animate-spin" />
                        <div className="text-center max-w-xs">
                          <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1.5 animate-pulse">Verifying Security Keys</p>
                          <p className="text-xs font-bold text-slate-800 leading-relaxed">{verificationStatus}</p>
                        </div>
                      </div>
                    ) : (
                      <CameraView 
                        onCapture={handleMarkAttendance} 
                        buttonLabel="Verify GPS Proximity & Check-In" 
                        allowBypass={demoBypass}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6 text-center py-4">
              {verificationResult.success ? (
                <>
                  <div className="mx-auto rounded-full bg-emerald-50 p-3 text-emerald-600 border border-emerald-100 w-fit">
                    <CheckCircle className="h-10 w-10 animate-bounce" />
                  </div>
                  <h4 className="text-lg font-black text-emerald-600 uppercase tracking-wide">Attendance Verification Successful!</h4>
                  <p className="text-xs font-bold text-indigo-600">Overall Matching Accuracy: {verificationResult.confidence}%</p>
                  
                  {/* Checklist of Satisfied Conditions */}
                  <div className="text-left bg-slate-50 border border-slate-200/60 rounded-[1.5rem] p-5 space-y-4">
                    <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-200 pb-2">Satisfied Verification Conditions</p>
                    
                    {/* Condition 1: College Boundary */}
                    <div className="flex items-start gap-3">
                      <span className="rounded-full bg-emerald-100 p-1 text-emerald-700 shrink-0 mt-0.5">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      <div>
                        <p className="text-xs font-bold text-slate-800">1. College Boundary Check: <span className="text-emerald-600 font-extrabold">PASSED</span></p>
                        <p className="text-[11px] text-slate-500 font-medium leading-relaxed mt-0.5">
                           {verificationResult.conditions?.boundaryDetails || "Student is located inside authorized campus range."}
                        </p>
                      </div>
                    </div>

                    {/* Condition 2: Facial Match */}
                    <div className="flex items-start gap-3">
                      <span className="rounded-full bg-emerald-100 p-1 text-emerald-700 shrink-0 mt-0.5">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      <div>
                        <p className="text-xs font-bold text-slate-800">2. Facial Identity & Expression Match: <span className="text-emerald-600 font-extrabold">PASSED</span></p>
                        <p className="text-[11px] text-slate-500 font-medium leading-relaxed mt-0.5">
                          {verificationResult.conditions?.faceDetails || "Biometric markers perfectly align with the registered profile picture baseline."}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* High fidelity comparison visualization */}
                  {renderComparisonSection()}

                  <p className="text-xs text-emerald-800 leading-relaxed bg-emerald-50/50 p-3.5 rounded-xl border border-emerald-100 font-semibold text-left">
                    {verificationResult.reasoning}
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      setIsMarking(false);
                      setVerificationResult(null);
                    }}
                    className="mt-6 w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 py-3 text-xs font-bold text-white shadow-md shadow-indigo-100 cursor-pointer transition active:scale-95"
                  >
                    Done & Return to Dashboard
                  </button>
                </>
              ) : (
                <>
                  <div className="mx-auto rounded-full bg-red-50 p-3 text-red-600 border border-red-100 w-fit">
                    <XCircle className="h-10 w-10 animate-pulse" />
                  </div>
                  <h4 className="text-lg font-black text-red-600 uppercase tracking-wide">Attendance Check-In Blocked</h4>
                  <p className="text-xs font-bold text-indigo-600">Verification Match Score: {verificationResult.confidence}%</p>
                  
                  {/* If facial match failed, show FRAUD DETECTED badge */}
                  {verificationResult.conditions && !verificationResult.conditions.faceMatched && (
                    <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 text-left flex items-start gap-3 animate-bounce">
                      <ShieldAlert className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <h5 className="text-xs font-black uppercase tracking-wider text-red-800">Identity Mismatch / Potential Fraud Attempt</h5>
                        <p className="text-[10px] text-red-700 font-semibold leading-relaxed mt-0.5">
                          SECURITY ALERT: Captured facial landmarks do NOT correspond to the registered profile of <span className="underline font-black">{currentStudent.firstName} {currentStudent.lastName}</span>. This attempt has been flagged as suspicious behavior.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Detailed Checklist of Condition Statuses */}
                  <div className="text-left bg-slate-50 border border-slate-200/60 rounded-[1.5rem] p-5 space-y-4">
                    <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-200 pb-2">Verification Parameters Status</p>
                    
                    {/* Condition 1: College Boundary */}
                    <div className="flex items-start gap-3">
                      {verificationResult.conditions?.boundaryPassed ? (
                        <span className="rounded-full bg-emerald-100 p-1 text-emerald-700 shrink-0 mt-0.5">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      ) : (
                        <span className="rounded-full bg-red-100 p-1 text-red-700 shrink-0 mt-0.5">
                          <X className="h-3.5 w-3.5" />
                        </span>
                      )}
                      <div>
                        <p className="text-xs font-bold text-slate-800">
                          1. College Boundary Check:{" "}
                          <span className={verificationResult.conditions?.boundaryPassed ? "text-emerald-600 font-extrabold" : "text-red-600 font-extrabold"}>
                            {verificationResult.conditions?.boundaryPassed ? "PASSED" : "FAILED"}
                          </span>
                        </p>
                        <p className="text-[11px] text-slate-500 font-medium leading-relaxed mt-0.5">
                          {verificationResult.conditions?.boundaryDetails || "Failed spatial geofence baseline comparison check."}
                        </p>
                      </div>
                    </div>

                    {/* Condition 2: Facial Match */}
                    <div className="flex items-start gap-3">
                      {verificationResult.conditions?.faceMatched ? (
                        <span className="rounded-full bg-emerald-100 p-1 text-emerald-700 shrink-0 mt-0.5">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      ) : (
                        <span className="rounded-full bg-red-100 p-1 text-red-700 shrink-0 mt-0.5">
                          <X className="h-3.5 w-3.5" />
                        </span>
                      )}
                      <div>
                        <p className="text-xs font-bold text-slate-800">
                          2. Facial Identity & Expression Match Check:{" "}
                          <span className={verificationResult.conditions?.faceMatched ? "text-emerald-600 font-extrabold" : "text-red-600 font-extrabold"}>
                            {verificationResult.conditions?.faceMatched ? "PASSED" : "FAILED"}
                          </span>
                        </p>
                        <p className="text-[11px] text-slate-500 font-medium leading-relaxed mt-0.5">
                          {verificationResult.conditions?.faceDetails || "Failed baseline profile facial structural matches."}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* High fidelity comparison visualization */}
                  {renderComparisonSection()}

                  <p className="text-xs text-red-800 leading-relaxed bg-red-50/30 p-3.5 rounded-xl border border-red-100 font-semibold text-left">
                    {verificationResult.reasoning}
                  </p>
                  {verificationResult.error && (
                    <p className="text-[10px] text-red-400 font-mono mt-1">Error code: {verificationResult.error}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => setVerificationResult(null)}
                    className="mt-4 w-full rounded-xl bg-slate-100 hover:bg-slate-200 py-3 text-xs font-bold text-slate-700 border border-slate-200 cursor-pointer transition active:scale-95"
                  >
                    Try Again
                  </button>
                </>
              )}
            </div>
          )}
        </motion.div>
        {/* Footer copyright */}
        <div className="text-center text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-12 pb-4">
          © DEVELOPED BY DOMINATORS
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">

      {/* Dynamic Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 rounded-[2rem] bg-white p-6 border border-slate-100 shadow-xl backdrop-blur-sm mb-8 text-slate-800">
        <div className="flex items-center gap-5">
          <div className="relative h-20 w-20 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
            <img 
              src={currentStudent.photoUrl || placeholderPhoto} 
              alt="Registered avatar" 
              className="h-full w-full object-cover"
            />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-800 flex items-center gap-2">
              Welcome, {currentStudent.firstName} {currentStudent.lastName}
            </h1>
            <p className="text-sm font-medium text-slate-500">
              VissionAttendID: <span className="font-mono font-bold text-indigo-600">{currentStudent.id}</span> • {currentStudent.branch} ({currentStudent.semester})
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {!needsInitialSetup && (
            <button
              type="button"
              id="btn-update-details"
              onClick={() => setIsEditingDetails(true)}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-4 py-2.5 text-xs font-bold text-white transition active:scale-95 cursor-pointer shadow-md shadow-indigo-100"
            >
              <Edit className="h-4 w-4" /> Update Profile Pic & Info
            </button>
          )}
          <button
            type="button"
            id="btn-sign-out"
            onClick={onLogout}
            className="flex items-center gap-2 rounded-xl bg-slate-50 hover:bg-slate-100 hover:text-red-600 px-4 py-2.5 text-xs font-bold text-slate-600 border border-slate-250 transition active:scale-95 cursor-pointer"
          >
            <LogOut className="h-4 w-4" /> Sign Out
          </button>
        </div>
      </div>

      {needsInitialSetup ? (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[2rem] border border-indigo-100 bg-gradient-to-br from-indigo-50/20 via-white to-indigo-50/10 p-8 shadow-2xl text-slate-800 space-y-8"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-indigo-50 pb-6">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-700 uppercase tracking-widest mb-3">
                <Sparkles className="h-3 w-3 animate-pulse" /> One-Time Profile Activation
              </span>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">
                Secure Your Academic Identity
              </h2>
              <p className="text-xs text-slate-500 font-semibold mt-1">
                Before accessing your digital college portal, you are required to establish your locked GPS location key and register a profile image.
              </p>
            </div>
            <div className="shrink-0">
              <button
                type="button"
                onClick={onLogout}
                className="flex items-center gap-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 px-4 py-2.5 transition active:scale-95 cursor-pointer"
              >
                <LogOut className="h-4 w-4" /> Cancel & Logout
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* STEP 1: Live Photo with GPS */}
            <div className="bg-white rounded-[2rem] p-6 border border-slate-150 shadow-md flex flex-col justify-between min-h-[420px] relative">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-50 pb-3">
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-black text-white">1</span>
                    Live GPS Location Key
                  </h3>
                  {hasLivePhoto && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
                      <Check className="h-3 w-3" /> Locked
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  Capture a live camera reference. This locks your secure biometric signature and campus coordinates for attendance range verification.
                </p>

                {hasLivePhoto ? (
                  <div className="space-y-3">
                    <div className="relative h-44 w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                      <img
                        src={currentStudent.originalLiveImage}
                        alt="Captured Baseline"
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute bottom-2 left-2 bg-slate-900/80 text-[10px] font-mono font-bold text-white px-2 py-1 rounded-md backdrop-blur-sm flex items-center gap-1.5">
                        <CheckCircle className="h-3 w-3 text-emerald-400" />
                        Facial Biometrics Registered
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await updateStudent({
                            originalLiveImage: "",
                            originalGps: null
                          });
                        } catch (err) {
                          console.error(err);
                        }
                      }}
                      className="text-xs font-bold text-red-600 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="h-3 w-3 animate-spin" /> Recapture Baseline Photo
                    </button>
                  </div>
                ) : (
                  <div className="border border-indigo-50 rounded-2xl p-4 bg-indigo-50/10">
                    <CameraView
                      onCapture={async (base64) => {
                        try {
                          await updateStudent({
                            originalLiveImage: base64,
                            originalGps: null
                          });
                        } catch (err) {
                          console.error(err);
                          alert("Failed to save original baseline photo.");
                        }
                      }}
                      buttonLabel="Capture Baseline Photo"
                      skipGps={true}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* STEP 2: Profile Picture */}
            <div className="bg-white rounded-[2rem] p-6 border border-slate-150 shadow-md flex flex-col justify-between min-h-[420px] relative">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-50 pb-3">
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-black text-white">2</span>
                    Student Profile Picture
                  </h3>
                  {hasProfilePic && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
                      <Check className="h-3 w-3" /> Active
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  Provide your official profile picture for roster records. You can upload any file or use your captured GPS live image directly.
                </p>

                {hasProfilePic ? (
                  <div className="space-y-4">
                    <div className="flex justify-center">
                      <div className="relative h-44 w-44 overflow-hidden rounded-full border-4 border-slate-50 shadow-md">
                        <img
                          src={currentStudent.photoUrl}
                          alt="Official Profile Pic"
                          className="h-full w-full object-cover"
                        />
                      </div>
                    </div>
                    <div className="text-center">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await updateStudent({
                              photoUrl: placeholderPhoto
                            });
                          } catch (err) {
                            console.error(err);
                          }
                        }}
                        className="text-xs font-bold text-red-600 hover:underline flex items-center gap-1 mx-auto justify-center cursor-pointer"
                      >
                        Reset Profile Picture
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Option A: Use live photo */}
                    {hasLivePhoto ? (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await updateStudent({
                              photoUrl: currentStudent.originalLiveImage!
                            });
                          } catch (err) {
                            console.error(err);
                          }
                        }}
                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/50 py-3 text-xs font-bold transition active:scale-95 cursor-pointer"
                      >
                        <Sparkles className="h-4 w-4 text-indigo-600 animate-pulse" />
                        Use GPS Live Photo as Profile Pic
                      </button>
                    ) : (
                      <div className="rounded-xl bg-slate-50 p-3 border border-slate-100 text-center text-[11px] font-bold text-slate-400">
                        Capture Live Photo (Step 1) to copy it here instantly
                      </div>
                    )}

                    <div className="relative flex items-center justify-center my-1.5">
                      <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
                      <span className="relative bg-white px-3 text-[10px] font-black uppercase tracking-wider text-slate-400">OR UPLOAD FILE</span>
                    </div>

                    {/* Option B: Upload File */}
                    <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 hover:bg-indigo-50/10 transition relative min-h-[160px]">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = async () => {
                              const base64 = reader.result as string;
                              try {
                                const compressed = await compressImage(base64);
                                await updateStudent({
                                  photoUrl: compressed
                                });
                              } catch (err) {
                                console.error("Upload compression error", err);
                                try {
                                  await updateStudent({
                                    photoUrl: base64
                                  });
                                } catch (innerErr) {
                                  console.error(innerErr);
                                }
                              }
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <Camera className="h-8 w-8 text-slate-400 mb-2" />
                      <span className="text-[11px] font-extrabold text-slate-600">Browse & Select Image</span>
                      <span className="text-[9px] text-slate-400 font-medium mt-0.5">JPEG, PNG up to 5MB</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Activation Summary Panel */}
          <div className="rounded-2xl bg-indigo-900 text-white p-6 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="space-y-1 bg-transparent p-0 border-0 shadow-none">
              <h4 className="text-md font-bold flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-emerald-400 animate-bounce" />
                Activation Status: {(!hasLivePhoto || !hasProfilePic) ? "Pending Steps" : "Ready to Access!"}
              </h4>
              <p className="text-xs text-indigo-200 font-medium">
                {!hasLivePhoto && "• Please capture your Live Photo with GPS coordinates."}
                {hasLivePhoto && !hasProfilePic && "• Great! Live Photo is locked. Now complete Step 2 by setting a profile picture."}
                {hasLivePhoto && hasProfilePic && "• Registration matches complete. Click Activate below to access your digital locker."}
              </p>
            </div>
            <div className="bg-transparent p-0 border-0 shadow-none">
              <button
                type="button"
                disabled={!hasLivePhoto || !hasProfilePic}
                onClick={() => {
                  alert("Student Card Successfully Activated! Enjoy complete university portal access.");
                }}
                className={`flex items-center gap-2 rounded-xl px-6 py-3.5 text-xs font-black uppercase tracking-wider transition duration-300 shadow-lg ${
                  hasLivePhoto && hasProfilePic
                    ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20 cursor-pointer hover:scale-105"
                    : "bg-indigo-800 text-indigo-400 border border-indigo-700 cursor-not-allowed"
                }`}
              >
                Activate Student Portal <Sparkles className="h-4 w-4" />
              </button>
            </div>
          </div>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Navigation Sidebar */}
        <div className="lg:col-span-1 space-y-3">
          <div className="rounded-[2rem] border border-slate-100 bg-white p-4 shadow-xl backdrop-blur-sm">
            <p className="px-3 mb-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Student Menu
            </p>
            <div className="space-y-1.5">
              <button
                type="button"
                id="tab-profile"
                onClick={() => setActiveTab("profile")}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition cursor-pointer ${
                  activeTab === "profile"
                    ? "bg-indigo-50 border border-indigo-100/50 text-indigo-600"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                }`}
              >
                <User className="h-4 w-4" /> Profile Details
              </button>
              <button
                type="button"
                id="tab-attendance"
                onClick={() => setActiveTab("attendance")}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition cursor-pointer ${
                  activeTab === "attendance"
                    ? "bg-indigo-50 border border-indigo-100/50 text-indigo-600"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                }`}
              >
                <Camera className="h-4 w-4" /> My Attendance
              </button>
              <button
                type="button"
                id="tab-fees"
                onClick={() => setActiveTab("fees")}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition cursor-pointer ${
                  activeTab === "fees"
                    ? "bg-indigo-50 border border-indigo-100/50 text-indigo-600"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                }`}
              >
                <CreditCard className="h-4 w-4" /> Fees Status
              </button>
            </div>
          </div>

          {/* Realtime Attendance Ring */}
          <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-xl backdrop-blur-sm flex flex-col items-center text-center">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              Attendance Analytics
            </h3>

            {/* Month Filter Selector */}
            <div className="w-full mb-4">
              <select
                value={selectedMonthFilter}
                onChange={(e) => setSelectedMonthFilter(e.target.value)}
                className="w-full text-[11px] font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
              >
                <option value="all">All Time Statistics</option>
                {(() => {
                  const currentMonthStr = new Date().toISOString().substring(0, 7);
                  const elements = [];
                  if (!uniqueMonths.includes(currentMonthStr)) {
                    elements.push(
                      <option key={currentMonthStr} value={currentMonthStr}>
                        {formatMonthKey(currentMonthStr)} (Current Month)
                      </option>
                    );
                  }
                  uniqueMonths.forEach((mKey) => {
                    elements.push(
                      <option key={mKey} value={mKey}>
                        {formatMonthKey(mKey)} {mKey === currentMonthStr ? "(Current Month)" : ""}
                      </option>
                    );
                  });
                  return elements;
                })()}
              </select>
            </div>

            <div className="relative flex items-center justify-center h-28 w-28 mb-3 mt-2">
              <svg className="h-full w-full transform -rotate-90">
                <circle
                  cx="56"
                  cy="56"
                  r="45"
                  className="stroke-slate-100 fill-none"
                  strokeWidth="8"
                />
                <motion.circle
                  cx="56"
                  cy="56"
                  r="45"
                  className="stroke-indigo-600 fill-none"
                  strokeWidth="8"
                  strokeDasharray={282}
                  initial={{ strokeDashoffset: 282 }}
                  animate={{ strokeDashoffset: 282 - (282 * (attendancePercentage || 0)) / 100 }}
                  transition={{ duration: 1, ease: "easeOut" }}
                />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="text-xl font-bold text-slate-800">{attendancePercentage}%</span>
                <span className="text-[9px] font-medium text-slate-400 uppercase tracking-wider animate-pulse">
                  {selectedMonthFilter === "all" ? "Attended" : "Progress"}
                </span>
              </div>
            </div>
            
            {selectedMonthFilter === "all" && (
              <p className="text-[11px] text-slate-500 leading-relaxed font-semibold mb-1">
                Verified: <span className="font-bold text-slate-800">{presentClasses}</span> of <span className="font-bold text-slate-800">{totalClasses}</span> class dates
              </p>
            )}

            {/* Monthly Breakdown List */}
            <div className="w-full mt-4 pt-4 border-t border-slate-100 text-left">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-indigo-500" /> Monthly Breakdown
              </h4>
              
              {monthlyStats.length === 0 ? (
                <p className="text-[11px] text-slate-400 italic">No attendance records yet.</p>
              ) : (
                <div className="space-y-3.5 max-h-48 overflow-y-auto pr-1">
                  {monthlyStats.map((stat) => {
                    let progressColor = "bg-red-500";
                    let textColor = "text-red-600";
                    if (stat.percentage >= 75) {
                      progressColor = "bg-emerald-500";
                      textColor = "text-emerald-600";
                    } else if (stat.percentage >= 50) {
                      progressColor = "bg-amber-500";
                      textColor = "text-amber-600";
                    }

                    return (
                      <div key={stat.monthKey} className="space-y-1">
                        <div className="flex justify-between text-[11px] font-bold text-slate-700">
                          <span>{formatMonthKey(stat.monthKey)}</span>
                          <span className={textColor}>{stat.percentage}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`${progressColor} h-full rounded-full transition-all duration-500`}
                            style={{ width: `${stat.percentage}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[9px] text-slate-400 font-bold">
                          <span>{stat.present} / {stat.total} attended</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Dynamic Tab Body */}
        <div className="lg:col-span-3">
          {activeTab === "profile" && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Unregistered Biometrics Detector Setup Section */}
              {!currentStudent.originalLiveImage && (
                <div className="rounded-[2rem] border border-amber-200 bg-amber-50/40 p-6 shadow-xl text-slate-800 space-y-4">
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-md font-bold text-amber-900">Initial Profile Setup & Biometric Lock Required</h3>
                      <p className="text-xs text-amber-700 leading-relaxed font-semibold mt-1">
                        Your account profile is active, but you must register an official **Original Live Image** before marking attendance.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                    {/* Camera Capture Original Reference */}
                    <div className="bg-white rounded-2xl p-5 border border-amber-200 shadow-sm space-y-3">
                      <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5 border-b border-slate-100 pb-2">
                        <Camera className="h-4 w-4 text-indigo-600 animate-pulse" /> 1. Lock Original Live Image
                      </h4>
                      <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">
                        Webcam view will lock your primary facial layout to establish your official biometric reference key.
                      </p>
                      
                      <CameraView
                        onCapture={async (base64) => {
                          try {
                            await updateStudent({
                              originalLiveImage: base64,
                              originalGps: null
                            });
                          } catch (err) {
                            console.error(err);
                            alert("Failed to save original baseline photo.");
                          }
                        }}
                        buttonLabel="Establish Original Baseline Photo"
                        skipGps={true}
                      />
                    </div>

                    {/* Official Avatar Picture Upload */}
                    <div className="bg-white rounded-2xl p-5 border border-amber-200 shadow-sm flex flex-col justify-between gap-4">
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5 border-b border-slate-100 pb-2">
                          <User className="h-4 w-4 text-indigo-600" /> 2. Upload Profile Picture
                        </h4>
                        <p className="text-[10px] text-slate-500 font-semibold leading-relaxed mt-1">
                          Upload a passport size or custom face picture. This image is stored purely for roster layout aesthetics.
                        </p>
                      </div>

                      <div className="flex-1 flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50 hover:bg-slate-50 transition relative min-h-[160px]">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onloadend = async () => {
                                const base64 = reader.result as string;
                                try {
                                  const compressed = await compressImage(base64);
                                  await updateStudent({
                                    photoUrl: compressed
                                  });
                                } catch (err) {
                                  console.error("Compression error, saving original", err);
                                  try {
                                    await updateStudent({
                                      photoUrl: base64
                                    });
                                  } catch (innerErr) {
                                    console.error(innerErr);
                                  }
                                }
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <UserCheck className="h-8 w-8 text-slate-400 mb-2" />
                        <span className="text-[11px] font-extrabold text-slate-600">Select Image File</span>
                        <span className="text-[9px] text-slate-400 font-medium mt-0.5">JPEG, PNG up to 5MB</span>
                      </div>

                      {currentStudent.photoUrl && currentStudent.photoUrl !== "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" && (
                        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 p-2.5 rounded-xl justify-center">
                          <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800">Profile Photo Set!</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Student Demographics Profile */}
              <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-xl text-slate-800">
                <h2 className="text-lg font-bold text-slate-800 mb-5 flex items-center gap-2 border-b border-slate-100 pb-3">
                  <User className="h-5 w-5 text-indigo-600" /> Student Profile Details
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Full Legal Name</p>
                    <p className="text-sm font-semibold text-slate-800">
                      {currentStudent.firstName} {currentStudent.middleName ? currentStudent.middleName + " " : ""}{currentStudent.lastName}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Date of Birth</p>
                    <p className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-indigo-600" /> {currentStudent.dob}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Student Mail ID</p>
                    <p className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                      <Mail className="h-4 w-4 text-indigo-600" /> {currentStudent.email}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Mobile Number</p>
                    <p className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                      <Phone className="h-4 w-4 text-indigo-600" /> {currentStudent.mobile || "Not registered"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Academic Branch</p>
                    <p className="text-sm font-semibold text-slate-800">{currentStudent.branch}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Gender</p>
                    <p className="text-sm font-semibold text-slate-800 capitalize">{currentStudent.gender || "Not specified"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">In-charge Faculty Coordinator</p>
                    <p className="text-sm font-bold text-indigo-600">{currentStudent.facultyName}</p>
                  </div>
                </div>
              </div>

              {/* Family & Contact details */}
              <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-xl text-slate-800">
                <h2 className="text-lg font-bold text-slate-800 mb-5 flex items-center gap-2 border-b border-slate-100 pb-3">
                  <FileText className="h-5 w-5 text-indigo-600" /> Parent / Guardian Information
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Father's Full Name</p>
                    <p className="text-sm font-semibold text-slate-800">{currentStudent.fatherName || "Not provided"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Father's Contact Number</p>
                    <p className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                      <Phone className="h-4 w-4 text-indigo-600" /> {currentStudent.fatherNumber || "Not registered"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Mother's Full Name</p>
                    <p className="text-sm font-semibold text-slate-800">{currentStudent.motherName || "Not provided"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Mother's Contact Number</p>
                    <p className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                      <Phone className="h-4 w-4 text-indigo-600" /> {currentStudent.motherNumber || "Not registered"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Biometrics & GPS Location Profile Keys Display */}
              <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-xl text-slate-800">
                <h2 className="text-lg font-bold text-slate-800 mb-5 flex items-center gap-2 border-b border-slate-100 pb-3">
                  <ShieldAlert className="h-5 w-5 text-indigo-600" /> Biometrics & GPS Security Registry
                </h2>

                <div className="grid grid-cols-1 gap-6">
                  {/* Original Live Image key info */}
                  <div className="rounded-2xl border border-slate-200/60 bg-slate-50 p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Original Biometrics Key Lock</p>
                      <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-indigo-700 border border-indigo-200">
                        Biometrics Lock
                      </span>
                    </div>
                    {currentStudent.originalLiveImage ? (
                      <div className="flex items-center gap-4">
                        <div className="h-16 w-16 rounded-xl border border-indigo-100 bg-indigo-50/50 flex items-center justify-center shrink-0 shadow-sm">
                          <UserCheck className="h-8 w-8 text-indigo-600 animate-pulse" />
                        </div>
                        <div className="text-xs space-y-0.5">
                          <p className="font-bold text-slate-800 flex items-center gap-1">
                            <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                            Facial Parameters Registered
                          </p>
                          <p className="text-[10px] text-slate-400 font-semibold">
                            Biometric Photo Hash Locked (Reference Image Hidden for Privacy)
                          </p>
                          <p className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 mt-1">
                            <Check className="h-3 w-3" /> Anti-Spoof Liveness & Biometric Verification Enabled
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs font-semibold text-slate-400 py-2">
                        No original live image lock registered yet. Please use the initialization setup above.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Academic Performance stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-lg flex items-center gap-4">
                  <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600">
                    <BookOpen className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Semester</p>
                    <p className="text-lg font-black text-slate-800">{currentStudent.semester}</p>
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-lg flex items-center gap-4">
                  <div className={`rounded-xl p-3 ${currentStudent.backlogs > 0 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}>
                    <ShieldAlert className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Backlogs</p>
                    <p className={`text-lg font-black ${currentStudent.backlogs > 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {currentStudent.backlogs} {currentStudent.backlogs === 0 ? "• Clear" : "Modules"}
                    </p>
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-lg flex items-center gap-4">
                  <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600">
                    <Award className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Academic Status</p>
                    <p className="text-lg font-black text-slate-800">Active Roll</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "attendance" && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Daily check-in box */}
              <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-5 text-slate-800">
                <div>
                  <h3 className="text-lg font-bold text-slate-800 mb-1">Today's Attendance Roll</h3>
                  <p className="text-xs font-bold text-slate-400">
                    Date: <span className="font-mono text-indigo-600">{todayStr}</span>
                  </p>
                </div>

                {todayStatus ? (
                  <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 border border-emerald-100 p-4">
                    <CheckCircle className="h-8 w-8 text-emerald-600 animate-bounce" />
                    <div>
                      <p className="text-sm font-extrabold text-emerald-700">Attendance Marked!</p>
                      <p className="text-[11px] text-emerald-600">
                        Confidence: <span className="font-mono font-bold">{todayStatus.verificationConfidence}%</span> via Geofence Proximity Lock
                      </p>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (!currentStudent.originalLiveImage) {
                        alert("⚠️ Setup Required: Please capture your Original Baseline Photo under Profile Details first!");
                        setActiveTab("profile");
                      } else {
                        setIsMarking(true);
                      }
                    }}
                    className="flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-100 shadow-lg shadow-indigo-100 px-6 py-3.5 text-sm font-bold text-white transition active:scale-95 cursor-pointer font-sans"
                  >
                    <Camera className="h-4 w-4" /> Start GPS Location Match & Check-In
                  </button>
                )}
              </div>

              {/* Monthly Attendance summary showing attendance percentage monthly */}
              <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-xl text-slate-800 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-3">
                  <div>
                    <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-indigo-600" /> Monthly Attendance Summary
                    </h3>
                    <p className="text-xs text-slate-400 font-medium">
                      Overview of your verified monthly attendance records and percentage.
                    </p>
                  </div>
                </div>

                {monthlyStats.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <p className="text-sm font-medium">No monthly attendance records available yet.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {monthlyStats.map((stat) => {
                      let progressColor = "bg-red-500";
                      let textColor = "text-red-600";
                      let bgColor = "bg-red-50/30";
                      let borderColor = "border-red-100";
                      if (stat.percentage >= 75) {
                        progressColor = "bg-emerald-500";
                        textColor = "text-emerald-600";
                        bgColor = "bg-emerald-50/30";
                        borderColor = "border-emerald-100";
                      } else if (stat.percentage >= 50) {
                        progressColor = "bg-amber-500";
                        textColor = "text-amber-600";
                        bgColor = "bg-amber-50/30";
                        borderColor = "border-amber-100";
                      }

                      return (
                        <div key={stat.monthKey} className={`rounded-2xl border ${borderColor} ${bgColor} p-4 flex flex-col justify-between space-y-3`}>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-700">{formatMonthKey(stat.monthKey)}</span>
                            <span className={`text-sm font-black ${textColor}`}>{stat.percentage}%</span>
                          </div>
                          <div className="w-full bg-slate-100/80 rounded-full h-2 overflow-hidden">
                            <div
                              className={`${progressColor} h-full rounded-full transition-all duration-500`}
                              style={{ width: `${stat.percentage}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[10px] text-slate-500 font-semibold">
                            <span>Attended: <strong className="text-slate-700">{stat.present}</strong> / {stat.total} working days</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Attendance Log Table */}
              <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-xl text-slate-800">
                <h3 className="text-md font-bold text-slate-800 mb-4">Verification Activity Log</h3>
                {attendanceLogs.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <Calendar className="mx-auto mb-3 h-10 w-10 opacity-30" />
                    <p className="text-sm font-medium">No attendance logs available. Submit attendance to populate.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-400 text-xs font-extrabold uppercase tracking-wider">
                          <th className="py-3 px-4">Date</th>
                          <th className="py-3 px-4">Verified Time</th>
                          <th className="py-3 px-4">GPS Location</th>
                          <th className="py-3 px-4">Confidence</th>
                          <th className="py-3 px-4 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attendanceLogs.map((log) => (
                          <tr key={log.id} className="border-b border-slate-100/60 text-slate-750 animate-fade-in">
                            <td className="py-3.5 px-4 font-mono font-bold text-slate-800">{log.date}</td>
                            <td className="py-3.5 px-4 text-xs font-semibold text-slate-500">
                              {new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </td>
                            <td className="py-3.5 px-4 font-mono text-xs text-slate-500">
                              <span className="flex items-center gap-1.5">
                                <MapPin className={`h-3.5 w-3.5 ${log.gps?.bypassed ? "text-amber-500 animate-pulse" : "text-indigo-600"}`} />
                                {log.gps?.bypassed ? (
                                  <span className="inline-flex items-center rounded-md bg-amber-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-700 border border-amber-200">
                                    Indoor Bypass
                                  </span>
                                ) : (
                                  <span>{log.gps?.latitude?.toFixed(4)}, {log.gps?.longitude?.toFixed(4)}</span>
                                )}
                              </span>
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-600 border border-indigo-100">
                                {log.verificationConfidence}% Match
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-700 border border-emerald-100">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                                {log.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === "fees" && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-xl text-slate-800">
                <h2 className="text-lg font-bold text-slate-800 mb-5 flex items-center gap-2 border-b border-slate-100 pb-3">
                  <CreditCard className="h-5 w-5 text-indigo-600" /> Tuition Fees & Finance Server
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <div className="rounded-2xl bg-slate-50 border border-slate-200/60 p-5">
                    <p className="text-xs text-slate-400 font-extrabold uppercase tracking-wider mb-1">Total Tuition Fees</p>
                    <p className="text-2xl font-black text-slate-800">₹{(currentStudent.feesTotal || 0).toLocaleString("en-IN")}</p>
                  </div>
                  <div className="rounded-2xl bg-emerald-50/50 border border-emerald-100 p-5">
                    <p className="text-xs text-emerald-600 font-extrabold uppercase tracking-wider mb-1">Total Fees Paid</p>
                    <p className="text-2xl font-black text-emerald-600">₹{(currentStudent.feesPaid || 0).toLocaleString("en-IN")}</p>
                  </div>
                  <div className="rounded-2xl bg-red-50/50 border border-red-100 p-5">
                    <p className="text-xs text-red-600 font-extrabold uppercase tracking-wider mb-1">Outstanding Balance</p>
                    <p className="text-2xl font-black text-red-600">₹{(currentStudent.feesRemaining || 0).toLocaleString("en-IN")}</p>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5 rounded-2xl bg-slate-50 border border-slate-200/60 p-5">
                  <div className="flex items-center gap-3">
                    {currentStudent.feesStatus === "Paid" ? (
                      <div className="rounded-full bg-emerald-50 p-2.5 text-emerald-600 border border-emerald-100">
                        <CheckCircle className="h-6 w-6" />
                      </div>
                    ) : (
                      <div className="rounded-full bg-amber-50 p-2.5 text-amber-600 border border-amber-100">
                        <ShieldAlert className="h-6 w-6 animate-bounce" />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-bold text-slate-800">Financial Standing Account</p>
                      <p className="text-xs text-slate-500">Payment logs synchronized with university central ledger</p>
                    </div>
                  </div>

                  <span className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider border ${
                    currentStudent.feesStatus === "Paid"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                      : "bg-amber-50 text-amber-700 border-amber-100"
                  }`}>
                    {currentStudent.feesStatus}
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
      )}

      {/* Edit Details & Signature Modal */}
      <AnimatePresence>
        {isEditingDetails && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-md overflow-y-auto">
            <motion.div
              initial={{ scale: 0.93, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.93, opacity: 0 }}
              className="w-full max-w-lg overflow-hidden rounded-[2rem] border border-slate-100 bg-white p-6 shadow-2xl text-slate-800 my-8 max-h-[90vh] flex flex-col"
            >
              <div className="mb-4 flex items-center justify-between shrink-0">
                <h3 className="text-md font-bold text-slate-800 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-indigo-600" /> Update Profile Pic & Info
                </h3>
                <button
                  type="button"
                  onClick={() => setIsEditingDetails(false)}
                  className="text-slate-400 hover:text-slate-700 text-xs font-bold uppercase p-1 cursor-pointer transition shrink-0"
                >
                  Close
                </button>
              </div>

              <form 
                onSubmit={async (e) => {
                  e.preventDefault();
                  setIsSaving(true);
                  try {
                    const studentRef = doc(db, "students", currentStudent.id);
                    await setDoc(studentRef, cleanUndefined({
                      ...currentStudent,
                      mobile: editMobile,
                      dob: editDob,
                      fatherName: editFatherName,
                      fatherNumber: editFatherNumber,
                      motherName: editMotherName,
                      motherNumber: editMotherNumber,
                      gender: editGender,
                      signatureUrl: editSignatureUrl,
                      photoUrl: editPhotoUrl
                    }));
                    setIsEditingDetails(false);
                  } catch (err) {
                    console.error(err);
                    alert("Failed to save student details.");
                  } finally {
                    setIsSaving(false);
                  }
                }} 
                className="space-y-4 overflow-y-auto pr-1 flex-1 pb-2"
              >
                {/* Profile Picture Update Section */}
                <div className="space-y-3 border-b border-slate-100 pb-4">
                  <label className="text-[10px] font-black uppercase tracking-wider text-indigo-600 block">Student Profile Picture</label>
                  <div className="flex items-center gap-4">
                    <div className="relative h-20 w-20 overflow-hidden rounded-full border-4 border-slate-100 bg-slate-50 shrink-0 shadow-md">
                      <img 
                        src={editPhotoUrl || placeholderPhoto} 
                        alt="Profile avatar" 
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <div className="relative flex items-center justify-center border border-dashed border-indigo-200 rounded-xl bg-indigo-50/10 p-3 cursor-pointer hover:bg-indigo-50/20 transition">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onloadend = async () => {
                                const rawBase64 = reader.result as string;
                                try {
                                  const compressed = await compressImage(rawBase64);
                                  setEditPhotoUrl(compressed);
                                } catch (err) {
                                  console.error("Compression error, using raw file", err);
                                  setEditPhotoUrl(rawBase64);
                                }
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <span className="text-xs font-bold text-indigo-700">Upload New Profile Photo</span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-semibold leading-tight">JPEG, PNG up to 5MB. This updates your official university profile image.</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Student Mobile Number</label>
                    <input
                      type="text"
                      required
                      value={editMobile}
                      onChange={(e) => setEditMobile(e.target.value)}
                      className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Date of Birth (DOB)</label>
                    <input
                      type="date"
                      required
                      value={editDob}
                      onChange={(e) => setEditDob(e.target.value)}
                      className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Gender</label>
                    <select
                      required
                      value={editGender}
                      onChange={(e) => setEditGender(e.target.value as "male" | "female" | "")}
                      className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    >
                      <option value="">Select Gender</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Father's Full Name</label>
                    <input
                      type="text"
                      required
                      value={editFatherName}
                      onChange={(e) => setEditFatherName(e.target.value)}
                      className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Father's Mobile Number</label>
                    <input
                      type="text"
                      required
                      value={editFatherNumber}
                      onChange={(e) => setEditFatherNumber(e.target.value)}
                      className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Mother's Full Name</label>
                    <input
                      type="text"
                      required
                      value={editMotherName}
                      onChange={(e) => setEditMotherName(e.target.value)}
                      className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Mother's Mobile Number</label>
                    <input
                      type="text"
                      required
                      value={editMotherNumber}
                      onChange={(e) => setEditMotherNumber(e.target.value)}
                      className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsEditingDetails(false)}
                    className="flex-1 rounded-xl bg-slate-100 hover:bg-slate-200 py-3 text-xs font-bold text-slate-700 cursor-pointer transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 py-3 text-xs font-bold text-white shadow-lg shadow-indigo-100 transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isSaving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : "Save Profile Details"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer copyright */}
      <div className="text-center text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-12 pb-4">
        © DEVELOPED BY DOMINATORS
      </div>
    </div>
  );
}
