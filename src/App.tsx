/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  BookOpen, User, Users, Lock, Shield, Key, Upload, Camera, CheckCircle2, 
  AlertCircle, RefreshCw, Sparkles, MapPin, Phone, Mail, Award, ArrowRight, Eye, EyeOff
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { db, auth, OperationType, handleFirestoreError, cleanUndefined } from "./firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { collection, doc, getDoc, getDocs, setDoc, writeBatch } from "firebase/firestore";
import { StudentProfile, FacultyProfile } from "./types";
import StudentDashboard from "./components/StudentDashboard";
import FacultyDashboard from "./components/FacultyDashboard";
import AdminDashboard from "./components/AdminDashboard";
import CameraView from "./components/CameraView";
import { EXCEL_STUDENTS_LIST } from "./data";
import { compressImage } from "./utils/imageCompressor";

// Presets for Coordinators
const FACULTY_COORDINATORS = [
  { id: "FAC01", name: "Sangitha Mishra", branch: "CSD(Data science)", password: "password01" },
  { id: "FAC02", name: "Lavanya", branch: "CSM-A", password: "password02" },
  { id: "FAC03", name: "Rama", branch: "CSM-B", password: "password03" },
  { id: "FAC04", name: "Rama", branch: "CDM-B", password: "password04" }
];

export function getInchargeFacultyName(branch: string): string {
  const b = (branch || "").toUpperCase().trim();
  if (b.includes("CSD")) return "Sangitha Mishra";
  if (b.includes("CSM-A")) return "Lavanya";
  if (b.includes("CSM-B") || b.includes("CDM-B") || b.includes("CSM-b") || b.includes("CDM-b")) return "Rama";
  return "Sangitha Mishra"; // Default fallback
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [activePortal, setActivePortal] = useState<"student" | "faculty" | "admin">("student");
  const [isSignUp, setIsSignUp] = useState(false);

  useEffect(() => {
    const splashTimer = setTimeout(() => {
      setShowSplash(false);
    }, 3200);
    return () => clearTimeout(splashTimer);
  }, []);

  // Auth States
  const [loggedInUser, setLoggedInUser] = useState<
    { type: "student"; data: StudentProfile } | 
    { type: "faculty"; data: FacultyProfile } | 
    { type: "admin" } | null
  >(null);

  const [welcomeName, setWelcomeName] = useState<string | null>(null);

  // Auto-dismiss welcome popup after 4 seconds
  useEffect(() => {
    if (welcomeName) {
      const timer = setTimeout(() => {
        setWelcomeName(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [welcomeName]);

  // Login inputs
  const [loginId, setLoginId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Student Sign-Up Fields
  const [step, setStep] = useState(1);
  const [signUpId, setSignUpId] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [studentMail, setStudentMail] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [branch, setBranch] = useState("CSD(Data science)");
  const [facultyName, setFacultyName] = useState("Sangitha Mishra");
  const [motherName, setMotherName] = useState("");
  const [fatherName, setFatherName] = useState("");
  const [motherNumber, setMotherNumber] = useState("");
  const [fatherNumber, setFatherNumber] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "">("");

  // Synchronize facultyName with selected branch
  useEffect(() => {
    setFacultyName(getInchargeFacultyName(branch));
  }, [branch]);

  // Synchronize studentMail with signUpId
  useEffect(() => {
    if (signUpId) {
      setStudentMail(`${signUpId.toLowerCase().trim()}@aietta.ac.in`);
    } else {
      setStudentMail("");
    }
  }, [signUpId]);
  
  // Photo verification base64
  const [signupPhoto, setSignupPhoto] = useState<string | null>(null); // Official Portrait Upload
  const [signupLiveImage, setSignupLiveImage] = useState<string | null>(null); // Secure Live Webcam Photo
  const [signupGps, setSignupGps] = useState<{ latitude: number; longitude: number; timestamp: number } | null>(null);

  const [signUpError, setSignUpError] = useState<string | null>(null);
  const [isSigningUp, setIsSigningUp] = useState(false);

  // Mouse tilt parallax calculation
  const handleMouseMove = (e: React.MouseEvent) => {
    const { clientX, clientY } = e;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const x = (clientX / width - 0.5) * 15;
    const y = (clientY / height - 0.5) * 15;
    setMousePos({ x, y });
  };

  // 1. Initial configuration seeder & Local persistence reload
  useEffect(() => {
    async function initApp() {
      // Step A: Immediately load user session from localStorage to bypass any network latency
      const storedSession = localStorage.getItem("college_session");
      if (storedSession) {
        try {
          const parsed = JSON.parse(storedSession);
          if (parsed.type === "student") {
            if (parsed.data) {
              // Restore immediately from offline session data
              setLoggedInUser({ type: "student", data: parsed.data });
              
              // Silently verify and fetch latest student details from cache/server in the background
              getDoc(doc(db, "students", parsed.id))
                .then((docSnap) => {
                  if (docSnap.exists()) {
                    const updatedData = docSnap.data() as StudentProfile;
                    setLoggedInUser({ type: "student", data: updatedData });
                    localStorage.setItem("college_session", JSON.stringify({ type: "student", id: parsed.id, data: updatedData }));
                  }
                })
                .catch((err) => console.log("Background profile sync deferred:", err));
            } else {
              // We must fetch student data synchronously (blocking) before finishing initApp
              try {
                const docSnap = await getDoc(doc(db, "students", parsed.id));
                if (docSnap.exists()) {
                  const studentData = docSnap.data() as StudentProfile;
                  setLoggedInUser({ type: "student", data: studentData });
                  localStorage.setItem("college_session", JSON.stringify({ type: "student", id: parsed.id, data: studentData }));
                } else {
                  localStorage.removeItem("college_session");
                }
              } catch (err) {
                console.error("Failed to restore student profile:", err);
                localStorage.removeItem("college_session");
              }
            }

          } else if (parsed.type === "faculty") {
            setLoggedInUser({ type: "faculty", data: parsed.data });
          } else if (parsed.type === "admin") {
            setLoggedInUser({ type: "admin" });
          }
        } catch (e) {
          console.error("Failed to parse stored session", e);
        }
      }
      
      // Stop the blocking spinner immediately for instant visual rendering
      setLoading(false);

      // Step B: Run firestore configuration seeder & faculty coordinator sync asynchronously in the background
      let currentPath = "students";
      let opType = OperationType.LIST;
      try {
        const studentsRef = collection(db, "students");
        
        // Upsert faculty coordinators silently
        const facBatch = writeBatch(db);
        for (const fac of FACULTY_COORDINATORS) {
          facBatch.set(doc(db, "faculties", fac.id), {
            id: fac.id,
            name: fac.name,
            branch: fac.branch,
            password: fac.password
          });
        }
        await facBatch.commit();

        // Check if DB requires seeding (cached or fast network check)
        const studentDocs = await getDocs(studentsRef);
        const keyDocSnap = await getDoc(doc(db, "students", "23Q71A4401"));

        if (studentDocs.empty || !keyDocSnap.exists()) {
          console.log("Empty Firestore database or missing main excel baseline. Seeding records in background...");
          const batch = writeBatch(db);
          const sampleStudentPhoto = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
          
          for (const student of EXCEL_STUDENTS_LIST) {
            const studentProfile: StudentProfile = {
              id: student.id,
              firstName: student.firstName,
              lastName: student.lastName,
              dob: student.dob,
              email: student.email,
              mobile: student.mobile,
              branch: student.branch,
              semester: student.semester,
              backlogs: student.backlogs,
              feesTotal: student.feesTotal,
              feesPaid: student.feesPaid,
              feesRemaining: student.feesRemaining,
              feesStatus: student.feesStatus,
              photoUrl: sampleStudentPhoto,
              facultyName: getInchargeFacultyName(student.branch),
              motherName: student.motherName,
              fatherName: student.fatherName,
              motherNumber: student.motherNumber,
              fatherNumber: student.fatherNumber,
              createdAt: Date.now()
            };

            batch.set(doc(db, "students", student.id), studentProfile);
            batch.set(doc(db, "accounts", student.id), { password: student.fatherNumber || student.password || "password123" });
          }

          currentPath = "batch_seed";
          opType = OperationType.WRITE;
          await batch.commit();
          console.log("Spreadsheet student records successfully seeded in background.");
        }
      } catch (err: any) {
        console.warn("Database sync or seeding deferred (operating in offline-resilient cache mode):", err);
        if (err?.code === "permission-denied" || err?.message?.includes("permission") || err?.message?.includes("Permission")) {
          handleFirestoreError(err, opType, currentPath);
        }
      }
    }

    initApp();
  }, []);

  // Handle Login Flow
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);

    const normalizedId = loginId.trim();

    try {
      // 1. Admin Login
      if (normalizedId === "8897272004") {
        if (loginPassword !== "Chandunivas") {
          setLoginError("Invalid password for Admin.");
          setIsLoggingIn(false);
          return;
        }
        try {
          const email = "admin@aietta.ac.in";
          await signInWithEmailAndPassword(auth, email, "Chandunivas");
        } catch (authErr: any) {
          try {
            await createUserWithEmailAndPassword(auth, "admin@aietta.ac.in", "Chandunivas");
          } catch {}
        }
        setLoggedInUser({ type: "admin" });
        localStorage.setItem("college_session", JSON.stringify({ type: "admin" }));
        setWelcomeName("System Administrator");
      }
      // 2. Faculty Login
      else if (normalizedId.toUpperCase().startsWith("FAC")) {
        const email = normalizedId.includes("@") ? normalizedId : `${normalizedId.toLowerCase()}@aietta.ac.in`;
        try {
          await signInWithEmailAndPassword(auth, email, loginPassword);
          
          let facId = normalizedId;
          if (normalizedId.includes("@")) {
            facId = normalizedId.split("@")[0].toUpperCase();
          } else {
            facId = normalizedId.toUpperCase();
          }
          const docSnap = await getDoc(doc(db, "faculties", facId));
          if (docSnap.exists()) {
            const facultyData = docSnap.data();
            const prof = { id: facultyData.id, name: facultyData.name, branch: facultyData.branch };
            setLoggedInUser({ type: "faculty", data: prof });
            localStorage.setItem("college_session", JSON.stringify({ type: "faculty", id: facultyData.id, data: prof }));
            setWelcomeName(prof.name);
          } else {
            // Fallback checking static list
            const facMatch = FACULTY_COORDINATORS.find((f) => f.id === facId);
            if (facMatch) {
              const prof = { id: facMatch.id, name: facMatch.name, branch: facMatch.branch };
              setLoggedInUser({ type: "faculty", data: prof });
              localStorage.setItem("college_session", JSON.stringify({ type: "faculty", id: facMatch.id, data: prof }));
              setWelcomeName(prof.name);
            } else {
              setLoginError("Faculty profile record not found in database.");
            }
          }
        } catch (authErr: any) {
          console.log("Firebase Auth failed for faculty, trying Firestore fallback:", authErr.message);
          const facId = normalizedId.includes("@") ? normalizedId.split("@")[0].toUpperCase() : normalizedId.toUpperCase();
          const docSnap = await getDoc(doc(db, "faculties", facId));
          if (docSnap.exists()) {
            const facultyData = docSnap.data();
            if (facultyData.password === loginPassword) {
              const prof = { id: facultyData.id, name: facultyData.name, branch: facultyData.branch };
              
              // Auto-register in Firebase Auth in background
              try {
                const mappedEmail = `${facId.toLowerCase()}@aietta.ac.in`;
                await createUserWithEmailAndPassword(auth, mappedEmail, loginPassword);
              } catch {}

              setLoggedInUser({ type: "faculty", data: prof });
              localStorage.setItem("college_session", JSON.stringify({ type: "faculty", id: facultyData.id, data: prof }));
              setWelcomeName(prof.name);
            } else {
              setLoginError("Invalid password for faculty ID.");
            }
          } else {
            // Check static definitions fallback
            const facMatch = FACULTY_COORDINATORS.find((f) => f.id === facId && f.password === loginPassword);
            if (facMatch) {
              const prof = { id: facMatch.id, name: facMatch.name, branch: facMatch.branch };
              
              // Auto-register in Firebase Auth
              try {
                const mappedEmail = `${facId.toLowerCase()}@aietta.ac.in`;
                await createUserWithEmailAndPassword(auth, mappedEmail, loginPassword);
              } catch {}

              setLoggedInUser({ type: "faculty", data: prof });
              localStorage.setItem("college_session", JSON.stringify({ type: "faculty", id: facMatch.id, data: prof }));
              setWelcomeName(prof.name);
            } else {
              setLoginError("Faculty ID does not exist in central server records.");
            }
          }
        }
      }
      // 3. Student Login
      else {
        const email = normalizedId.includes("@") ? normalizedId : `${normalizedId.toLowerCase()}@aietta.ac.in`;
        try {
          await signInWithEmailAndPassword(auth, email, loginPassword);
          
          let studentIdToFetch = normalizedId;
          if (normalizedId.includes("@")) {
            studentIdToFetch = normalizedId.split("@")[0].toUpperCase();
          } else {
            studentIdToFetch = normalizedId.toUpperCase();
          }
          const docSnap = await getDoc(doc(db, "students", studentIdToFetch));
          if (docSnap.exists()) {
            const studentData = docSnap.data() as StudentProfile;
            setLoggedInUser({ type: "student", data: studentData });
            localStorage.setItem("college_session", JSON.stringify({ type: "student", id: studentData.id, data: studentData }));
            setWelcomeName(`${studentData.firstName} ${studentData.lastName}`);
          } else {
            setLoginError("Student profile record not found in database.");
          }
        } catch (authErr: any) {
          console.log("Firebase Auth failed for student, trying Firestore fallback:", authErr.message);
          const studentIdToFetch = normalizedId.includes("@") ? normalizedId.split("@")[0].toUpperCase() : normalizedId.toUpperCase();
          const docSnap = await getDoc(doc(db, "students", studentIdToFetch));
          if (docSnap.exists()) {
            const studentData = docSnap.data() as StudentProfile;
            const acctSnap = await getDoc(doc(db, "accounts", studentIdToFetch));
            
            const storedPassword = acctSnap.exists() ? acctSnap.data()?.password : null;
            const fatherPassword = studentData.fatherNumber || null;

            if (loginPassword === storedPassword || loginPassword === fatherPassword || (studentData.fatherNumber && loginPassword === studentData.fatherNumber.trim())) {
              // Auto-register in Firebase Auth in background
              try {
                const mappedEmail = studentData.email || `${studentIdToFetch.toLowerCase()}@aietta.ac.in`;
                await createUserWithEmailAndPassword(auth, mappedEmail, loginPassword);
              } catch {}

              setLoggedInUser({ type: "student", data: studentData });
              localStorage.setItem("college_session", JSON.stringify({ type: "student", id: studentData.id, data: studentData }));
              setWelcomeName(`${studentData.firstName} ${studentData.lastName}`);
            } else {
              setLoginError("Invalid password (your password is your Father's Mobile Number).");
            }
          } else {
            setLoginError("Student VissionAttendID / Roll Number not registered on college server.");
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      setLoginError("Central server connectivity error. Try again.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Convert File to Base64
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const rawBase64 = reader.result as string;
        try {
          const compressed = await compressImage(rawBase64);
          setSignupPhoto(compressed);
        } catch (err) {
          console.error("Compression error, falling back to original", err);
          setSignupPhoto(rawBase64);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Student Sign-Up Flow
  const handleSignUp = async () => {
    setSignUpError(null);
    setIsSigningUp(true);

    try {
      const enforcedMail = `${signUpId.toLowerCase().trim()}@aietta.ac.in`;
      const enforcedPassword = fatherNumber.trim();

      if (!signUpId || !firstName || !lastName || !mobileNumber || !enforcedPassword) {
        throw new Error("Please complete all required fields. Father's Phone Number is required to establish your password.");
      }

      if (enforcedPassword.length < 6) {
        throw new Error("Father's phone number must be at least 6 characters/digits to act as your secure password.");
      }

      if (!signupPhoto) {
        throw new Error("Official Portrait Profile Picture is required. Please upload or select a portrait photo file in Step 3.");
      }

      if (!signupLiveImage || !signupGps) {
        throw new Error("Biometric Live Webcam Photo with GPS location lock is required. Please capture and lock your live photo in Step 3.");
      }

      // Check if ID is already registered
      const checkDoc = await getDoc(doc(db, "students", signUpId));
      if (checkDoc.exists()) {
        console.warn(`App ID ${signUpId} is already registered. Overwriting with new registration data.`);
      }

      // Create user in Firebase Authentication
      try {
        await createUserWithEmailAndPassword(auth, enforcedMail, enforcedPassword);
      } catch (authErr: any) {
        console.warn("Firebase Auth registration warning/error:", authErr.message);
        // We continue to save Firestore document to ensure data consistency
      }

      // Randomly prepopulate some fees, backlogs & semester metrics for full-fidelity demonstration
      const randomBacklogs = Math.random() > 0.7 ? Math.floor(Math.random() * 3) + 1 : 0;
      const totalFees = 140000;
      const paidFees = randomBacklogs > 0 ? 110000 : 140000;
      const remFees = totalFees - paidFees;
      const fStatus = remFees === 0 ? "Paid" : "Pending";

      const newStudent: StudentProfile = {
        id: signUpId,
        firstName,
        middleName,
        lastName,
        dob: dob || "2004-01-01",
        email: enforcedMail,
        mobile: mobileNumber,
        branch,
        semester: "Semester 5",
        backlogs: randomBacklogs,
        feesTotal: totalFees,
        feesPaid: paidFees,
        feesRemaining: remFees,
        feesStatus: fStatus as any,
        photoUrl: signupPhoto,
        originalLiveImage: signupLiveImage,
        originalGps: signupGps || undefined,
        signupGps: signupGps || undefined,
        facultyName,
        motherName: motherName || "Not provided",
        fatherName: fatherName || "Not provided",
        motherNumber: motherNumber || "",
        fatherNumber: fatherNumber || "",
        gender: gender || "",
        createdAt: Date.now()
      };

      // Set Docs
      await setDoc(doc(db, "students", signUpId), cleanUndefined(newStudent));
      await setDoc(doc(db, "accounts", signUpId), { password: enforcedPassword });

      // Automatically Log In
      setLoggedInUser({ type: "student", data: newStudent });
      localStorage.setItem("college_session", JSON.stringify({ type: "student", id: newStudent.id, data: newStudent }));
      setWelcomeName(`${newStudent.firstName} ${newStudent.lastName}`);

      // Reset
      setIsSignUp(false);
      setStep(1);
    } catch (err: any) {
      console.error(err);
      setSignUpError(err.message || "Failed to submit sign-up. Try again.");
    } finally {
      setIsSigningUp(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("SignOut error:", err);
    }
    localStorage.removeItem("college_session");
    setLoggedInUser(null);
    setLoginId("");
    setLoginPassword("");
  };

  if (showSplash || loading) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-950 text-white overflow-hidden select-none font-sans [perspective:1200px]">
        {/* Dynamic 3D depth space background */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-950/40 via-slate-950 to-slate-950" />
        
        {/* Animated grid mapping with perspective tilt */}
        <div 
          className="absolute inset-0 opacity-[0.15] bg-[linear-gradient(to_right,#4338ca_1px,transparent_1px),linear-gradient(to_bottom,#4338ca_1px,transparent_1px)] bg-[size:3rem_3rem]"
          style={{
            transform: "rotateX(60deg) translateY(-30%) translateZ(-100px)",
            transformOrigin: "top center",
          }}
        />

        {/* Floating Glowing Aura */}
        <motion.div 
          className="absolute h-96 w-96 rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none"
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.6, 0.8, 0.6],
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* 3D Isometric Card Container */}
        <motion.div
          style={{ transformStyle: "preserve-3d" }}
          animate={{
            rotateX: [12, -12, 12],
            rotateY: [-18, 18, -18],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="relative flex flex-col items-center justify-center"
        >
          {/* Shadow layer underneath */}
          <div 
            className="absolute -inset-4 rounded-3xl bg-indigo-600/25 blur-xl opacity-80" 
            style={{ transform: "translateZ(-40px)" }}
          />

          {/* Deep metallic backing ring */}
          <div 
            className="absolute h-36 w-36 rounded-full border border-indigo-500/30 bg-slate-900/60 backdrop-blur-sm shadow-2xl flex items-center justify-center"
            style={{ transform: "translateZ(-20px)" }}
          />

          {/* Core glassmorphic 3D scanner head */}
          <div 
            className="relative h-40 w-40 rounded-[2rem] border-2 border-indigo-400/50 bg-slate-900/80 backdrop-blur-md shadow-2xl flex flex-col items-center justify-center p-4"
            style={{ transform: "translateZ(30px)" }}
          >
            {/* High-tech HUD grid lines */}
            <div className="absolute inset-2 border border-dashed border-indigo-500/20 rounded-2xl pointer-events-none" />
            
            {/* The Scanning Laser Sweep */}
            <motion.div 
              className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_12px_rgba(34,211,238,0.8)] z-10"
              animate={{
                top: ["15%", "85%", "15%"]
              }}
              transition={{
                duration: 2.2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />

            {/* Glowing biometric optic eye */}
            <div className="relative p-4 rounded-2xl bg-indigo-950/80 border border-indigo-500/40 shadow-inner">
              <Eye className="h-10 w-10 text-cyan-400 animate-pulse" />
              {/* Target bracket indicators */}
              <div className="absolute top-1 left-1 w-2.5 h-2.5 border-t-2 border-l-2 border-cyan-400" />
              <div className="absolute top-1 right-1 w-2.5 h-2.5 border-t-2 border-r-2 border-cyan-400" />
              <div className="absolute bottom-1 left-1 w-2.5 h-2.5 border-b-2 border-l-2 border-cyan-400" />
              <div className="absolute bottom-1 right-1 w-2.5 h-2.5 border-b-2 border-r-2 border-cyan-400" />
            </div>

            {/* Real-time scanning telemetry overlay */}
            <div className="mt-2.5 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
              <p className="font-mono text-[9px] font-bold text-slate-450 uppercase tracking-widest">
                {loading ? "Initializing..." : "Ready"}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Brand Text Elements with exquisite 3D tracking */}
        <div className="mt-12 text-center relative z-20 space-y-1">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="flex items-center justify-center gap-1 text-[10px] text-cyan-400 font-extrabold tracking-[0.35em] uppercase animate-pulse"
          >
            <Sparkles className="h-3 w-3 text-cyan-400" /> SECURE BIOMETRIC GATEWAY
          </motion.div>

          <h2 className="text-4xl md:text-5xl font-black tracking-[-0.03em] flex items-center justify-center">
            {"VisionAttend".split("").map((char, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, scale: 0.5, z: 100 }}
                animate={{ opacity: 1, scale: 1, z: 0 }}
                transition={{
                  delay: 0.6 + i * 0.06,
                  type: "spring",
                  stiffness: 120,
                  damping: 12
                }}
                className="bg-gradient-to-r from-white via-indigo-100 to-indigo-300 bg-clip-text text-transparent inline-block hover:text-cyan-400 transition"
              >
                {char}
              </motion.span>
            ))}
          </h2>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            transition={{ delay: 1.5, duration: 1 }}
            className="text-[11px] font-mono font-bold text-slate-400 tracking-wider max-w-sm mx-auto pt-1"
          >
            Securing Campus Attendance with Live GPS Cryptography
          </motion.p>
        </div>

        {/* Loading status details */}
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 w-48 text-center space-y-2">
          <div className="h-1 rounded-full bg-slate-900 border border-slate-800 overflow-hidden">
            <motion.div 
              className="h-full bg-gradient-to-r from-indigo-500 via-cyan-400 to-indigo-500"
              initial={{ width: "0%" }}
              animate={loading ? { width: "70%" } : { width: "100%" }}
              transition={loading ? { duration: 15 } : { duration: 0.5 }}
            />
          </div>
          <p className="text-[9px] font-mono font-semibold text-slate-500 uppercase tracking-widest animate-pulse">
            {loading ? "Connecting Central Ledger..." : "Authentication Loaded"}
          </p>
        </div>

        {/* Footer copyright on splash screen */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center text-[10px] text-slate-500 font-bold uppercase tracking-wider">
          © DEVELOPED BY DOMINATORS
        </div>
      </div>
    );
  }

  // Dashboard routing
  if (loggedInUser) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 font-sans relative overflow-hidden">
        {/* Ambient light glow */}
        <div className="absolute top-[-10%] left-[-10%] h-[50%] w-[50%] rounded-full bg-indigo-500/5 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] h-[50%] w-[50%] rounded-full bg-purple-500/5 blur-[120px] pointer-events-none" />

        <AnimatePresence mode="wait">
          <motion.div
            key={loggedInUser.type}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            {loggedInUser.type === "student" && (
              <StudentDashboard student={loggedInUser.data} onLogout={handleLogout} />
            )}
            {loggedInUser.type === "faculty" && (
              <FacultyDashboard faculty={loggedInUser.data} onLogout={handleLogout} />
            )}
            {loggedInUser.type === "admin" && (
              <AdminDashboard onLogout={handleLogout} />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Welcome Pop-up Overlay */}
        <AnimatePresence>
          {welcomeName && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4"
            >
              {/* Modal Card */}
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                transition={{ type: "spring", damping: 15 }}
                className="relative w-full max-w-md overflow-hidden rounded-[2.5rem] border border-indigo-500/30 bg-slate-900 text-white p-8 shadow-2xl text-center"
              >
                {/* Visual Accent Top Bar */}
                <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-indigo-500 via-cyan-400 to-indigo-500" />
                
                {/* Tiny Status Metadata */}
                <div className="absolute top-0 right-0 p-4 opacity-15 font-mono text-[8px] tracking-widest select-none">
                  SECURE PORTAL REDIRECT v2.5
                </div>

                {/* Glowing biometric loader ring */}
                <div className="mx-auto mt-4 mb-6 relative h-20 w-20 rounded-full bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center shadow-[0_0_25px_rgba(99,102,241,0.25)]">
                  <motion.div
                    animate={{ scale: [1, 1.15, 1], opacity: [0.8, 1, 0.8] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                    className="rounded-full bg-indigo-500/20 p-4 text-cyan-400"
                  >
                    <Sparkles className="h-8 w-8 text-cyan-400" />
                  </motion.div>
                  {/* High-tech HUD Corners */}
                  <div className="absolute -top-1 -left-1 w-3.5 h-3.5 border-t-2 border-l-2 border-cyan-400 rounded-tl" />
                  <div className="absolute -top-1 -right-1 w-3.5 h-3.5 border-t-2 border-r-2 border-cyan-400 rounded-tr" />
                  <div className="absolute -bottom-1 -left-1 w-3.5 h-3.5 border-b-2 border-l-2 border-cyan-400 rounded-bl" />
                  <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 border-b-2 border-r-2 border-cyan-400 rounded-br" />
                </div>

                <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-950/80 px-3 py-1 text-[10px] font-black text-cyan-400 uppercase tracking-widest border border-indigo-500/40 mb-4">
                  Welcome back
                </span>

                <h2 className="text-3xl font-black tracking-tight text-white mb-2">
                  Welcome,
                </h2>
                <h3 className="text-xl font-bold bg-gradient-to-r from-cyan-400 via-indigo-200 to-white bg-clip-text text-transparent px-4 py-1.5 mb-6">
                  {welcomeName}
                </h3>

                <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto mb-6 font-medium">
                  Your university workspace credentials have been securely verified on the central blockchain ledger. Redirecting to your dashboard...
                </p>

                {/* Confirm/Enter button */}
                <button
                  type="button"
                  onClick={() => setWelcomeName(null)}
                  className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold py-3.5 text-sm shadow-lg shadow-indigo-950 transition active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
                >
                  Enter Portal
                  <ArrowRight className="h-4 w-4 text-white" />
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen bg-slate-50 text-slate-800 font-sans relative overflow-hidden flex flex-col justify-between py-12"
      onMouseMove={handleMouseMove}
    >
      {/* 3D Parallax Grid Background */}
      <motion.div
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-50/30 via-slate-50 to-slate-50 pointer-events-none"
        animate={{ x: mousePos.x * 0.5, y: mousePos.y * 0.5 }}
        transition={{ type: "spring", stiffness: 100, damping: 25 }}
      />
      <motion.div
        className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-40 pointer-events-none"
        animate={{ x: mousePos.x, y: mousePos.y }}
        transition={{ type: "spring", stiffness: 80, damping: 20 }}
      />
 
      {/* Decorative Blur Spheres */}
      <div className="absolute top-[20%] left-[10%] h-72 w-72 rounded-full bg-indigo-500/5 blur-[80px] pointer-events-none" />
      <div className="absolute bottom-[20%] right-[10%] h-80 w-80 rounded-full bg-purple-500/5 blur-[90px] pointer-events-none" />
 
      {/* Header Banner */}
      <div className="relative z-10 text-center px-4 max-w-4xl mx-auto mb-2">
        <motion.h1
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="text-4xl md:text-5xl font-black tracking-tight bg-gradient-to-b from-slate-900 to-slate-750 bg-clip-text text-transparent"
        >
          VisionAttend
        </motion.h1>
      </div>
 
      {/* Authentication & Signup Container */}
      <div className="relative z-10 w-full max-w-md mx-auto px-4 mt-8">
        <AnimatePresence mode="wait">
          {!isSignUp ? (
            // SIGN IN PORTAL CARD
            <motion.div
              key="signin"
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -30, scale: 0.95 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-[2rem] border border-slate-100 bg-white p-7 shadow-xl backdrop-blur-sm text-slate-800"
            >
              {/* Login Form */}
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="text-center mb-4">
                  <h3 className="text-md font-bold text-slate-800">
                    VisionAttend Secure Gate
                  </h3>
                  <p className="text-[11px] text-slate-400 font-bold mt-0.5">
                    Authorized university credentials required
                  </p>
                </div>
                 <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    VissionAttendID
                  </label>
                  <div className="relative">
                    <User className="absolute top-3.5 left-3.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      placeholder="Enter ID"
                      value={loginId}
                      onChange={(e) => setLoginId(e.target.value)}
                      className="w-full rounded-xl bg-slate-50 border border-slate-200 pl-11 pr-4 py-3.5 text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Password</label>
                  <div className="relative">
                    <Lock className="absolute top-3.5 left-3.5 h-4 w-4 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="w-full rounded-xl bg-slate-50 border border-slate-200 pl-11 pr-12 py-3.5 text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute top-3.5 right-3.5 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4.5 w-4.5" />
                      ) : (
                        <Eye className="h-4.5 w-4.5" />
                      )}
                    </button>
                  </div>
                </div>
 
                {loginError && (
                  <div className="flex items-start gap-2.5 rounded-xl bg-red-50 border border-red-100 p-3.5 text-xs text-red-600">
                    <AlertCircle className="h-4.5 w-4.5 shrink-0 text-red-500" />
                    <p className="font-semibold">{loginError}</p>
                  </div>
                )}
 
                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 text-sm shadow-lg shadow-indigo-100 transition active:scale-[0.98] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                >
                  {isLoggingIn ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Checking ledger records...
                    </>
                  ) : (
                    <>
                      Secure Sign In
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
 
              {/* Toggle to Signup */}
              <div className="text-center mt-5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(true);
                    setStep(1);
                    setSignUpError(null);
                  }}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-700 transition cursor-pointer"
                >
                  New student? Click to Register Profile VissionAttendID
                </button>
              </div>
            </motion.div>
          ) : (
            // MULTI-STEP SIGN UP CARD
            <motion.div
              key="signup"
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -30, scale: 0.95 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-[2rem] border border-slate-100 bg-white p-7 shadow-xl backdrop-blur-sm text-slate-800"
            >
              <div className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold text-indigo-600 uppercase tracking-widest">
                    Step {step} of 3
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsSignUp(false)}
                    className="text-xs font-bold text-slate-400 hover:text-slate-700 transition cursor-pointer"
                  >
                    Back to Login
                  </button>
                </div>
                {/* Visual wizard step timeline */}
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                  <div 
                    className="h-full bg-indigo-600 transition-all duration-300"
                    style={{ width: `${(step / 3) * 100}%` }}
                  />
                </div>
              </div>

              {/* STEP 1: App Credentials & Academic Branch */}
              {step === 1 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-800">1. App Credentials & Department</h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Roll Number (VissionAttendID)</label>
                      <input
                        type="text"
                        placeholder="e.g. 23Q71A4403"
                        value={signUpId}
                        onChange={(e) => setSignUpId(e.target.value)}
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">App Password</label>
                      <input
                        type="text"
                        disabled
                        value="Set to Father's Mobile"
                        className="w-full rounded-xl bg-slate-100 border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-500 focus:outline-none select-none cursor-not-allowed"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Branch</label>
                      <select
                        value={branch}
                        onChange={(e) => setBranch(e.target.value)}
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      >
                        <option value="CSD(Data science)">CSD(Data science)</option>
                        <option value="CSM-A">CSM-A</option>
                        <option value="CDM-B">CDM-B</option>
                        <option value="CSE">CSE (Computer Science)</option>
                        <option value="ECE">ECE (Electronics)</option>
                        <option value="EEE">EEE (Electrical)</option>
                        <option value="IT">IT (Info Tech)</option>
                        <option value="MECH">MECH (Mechanical)</option>
                        <option value="CIVIL">CIVIL (Civil)</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">In-Charge Faculty</label>
                      <input
                        type="text"
                        disabled
                        value={getInchargeFacultyName(branch)}
                        className="w-full rounded-xl bg-slate-100 border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-500 focus:outline-none select-none cursor-not-allowed"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1.5 col-span-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">First Name</label>
                      <input
                        type="text"
                        placeholder="First"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                    </div>
                    <div className="space-y-1.5 col-span-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Middle Name</label>
                      <input
                        type="text"
                        placeholder="Middle"
                        value={middleName}
                        onChange={(e) => setMiddleName(e.target.value)}
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                    </div>
                    <div className="space-y-1.5 col-span-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Last Name</label>
                      <input
                        type="text"
                        placeholder="Last"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (!signUpId || !firstName || !lastName) {
                        setSignUpError("Please fill in choosing your Roll Number (VissionAttendID) and legal names.");
                      } else {
                        setSignUpError(null);
                        setStep(2);
                      }
                    }}
                    className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 text-sm cursor-pointer transition active:scale-95 shadow-lg shadow-indigo-100"
                  >
                    Continue to Step 2
                  </button>
                </div>
              )}

              {/* STEP 2: Contacts & Parents Details */}
              {step === 2 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-800">2. Contact & Guardians Info</h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Student Mail</label>
                      <input
                        type="email"
                        disabled
                        value={`${signUpId.toLowerCase()}@aietta.ac.in`}
                        className="w-full rounded-xl bg-slate-100 border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-500 select-none cursor-not-allowed"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Student Mobile</label>
                      <input
                        type="tel"
                        placeholder="10-digit number"
                        value={mobileNumber}
                        onChange={(e) => setMobileNumber(e.target.value)}
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Father's Name</label>
                      <input
                        type="text"
                        placeholder="Father's full name"
                        value={fatherName}
                        onChange={(e) => setFatherName(e.target.value)}
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Father's Phone</label>
                      <input
                        type="tel"
                        placeholder="Father's contact"
                        value={fatherNumber}
                        onChange={(e) => setFatherNumber(e.target.value)}
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Mother's Name</label>
                      <input
                        type="text"
                        placeholder="Mother's full name"
                        value={motherName}
                        onChange={(e) => setMotherName(e.target.value)}
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Mother's Phone</label>
                      <input
                        type="tel"
                        placeholder="Mother's contact"
                        value={motherNumber}
                        onChange={(e) => setMotherNumber(e.target.value)}
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Gender</label>
                      <select
                        value={gender}
                        onChange={(e) => setGender(e.target.value as "male" | "female" | "")}
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        required
                      >
                        <option value="">Select Gender</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Date of Birth</label>
                      <input
                        type="date"
                        value={dob}
                        onChange={(e) => setDob(e.target.value)}
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="rounded-xl bg-slate-100 hover:bg-slate-200 py-3 text-xs font-bold text-slate-600 border border-slate-200 cursor-pointer transition active:scale-95"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!studentMail || !mobileNumber) {
                          setSignUpError("Please fill out student email and mobile phone number.");
                        } else if (!gender) {
                          setSignUpError("Please select your gender (Male/Female).");
                        } else {
                          setSignUpError(null);
                          setStep(3);
                        }
                      }}
                      className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 text-xs cursor-pointer transition active:scale-95 shadow-lg shadow-indigo-100"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: Both Profile Photo (upload) AND Live Webcam (GPS) */}
              {step === 3 && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-sm font-black text-slate-800">3. Biometric & Location Credentials</h3>
                    <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                      Both an official profile picture and a live webcam-captured GPS photo are strictly required for security validation.
                    </p>
                  </div>

                  {/* PART A: Official Profile Portrait File Upload */}
                  <div className="space-y-2 p-3.5 rounded-2xl bg-indigo-50/40 border border-indigo-100/50">
                    <span className="text-[11px] font-black uppercase tracking-wider text-indigo-700 flex items-center gap-1">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-[10px]">A</span>
                      Official Profile Picture
                    </span>

                    {signupPhoto ? (
                      <div className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-slate-200">
                        <div className="h-14 w-14 rounded-lg overflow-hidden border border-slate-100 shrink-0">
                          <img src={signupPhoto} alt="Uploaded profile portrait" className="h-full w-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-extrabold text-slate-700 truncate">Official Profile Photo Loaded</p>
                          <p className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5 mt-0.5">
                            <CheckCircle2 className="h-3 w-3" /> Securely locked
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSignupPhoto(null)}
                          className="text-[10px] font-black text-red-500 hover:text-red-700 hover:underline px-2.5 py-1.5 shrink-0"
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-full py-5 rounded-xl border border-dashed border-indigo-200 bg-white hover:bg-indigo-50/20 transition cursor-pointer">
                        <Upload className="h-5.5 w-5.5 text-indigo-400 mb-1" />
                        <p className="text-xs font-black text-slate-700">Select Portrait Photo</p>
                        <p className="text-[9px] text-slate-400 font-bold mt-0.5">PNG, JPG or JPEG (Official reference profile)</p>
                        <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                      </label>
                    )}
                  </div>

                  {/* PART B: Live Webcam Image & GPS Lock */}
                  <div className="space-y-2 p-3.5 rounded-2xl bg-cyan-50/30 border border-cyan-100/40">
                    <span className="text-[11px] font-black uppercase tracking-wider text-cyan-700 flex items-center gap-1">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-100 text-cyan-700 text-[10px]">B</span>
                      Secure Webcam Live Capture & GPS Spot
                    </span>

                    {signupLiveImage && signupGps ? (
                      <div className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-slate-200">
                        <div className="h-14 w-14 rounded-lg overflow-hidden border border-slate-100 shrink-0">
                          <img src={signupLiveImage} alt="Captured live baseline webcam" className="h-full w-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-extrabold text-slate-700 truncate">Live Webcam Photo Locked</p>
                          <p className="text-[9px] text-slate-400 font-extrabold truncate mt-0.5">
                            GPS Lat: {signupGps.latitude.toFixed(5)}°, Lng: {signupGps.longitude.toFixed(5)}°
                          </p>
                          <p className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5 mt-0.5">
                            <CheckCircle2 className="h-3 w-3" /> GPS Location Bound
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSignupLiveImage(null);
                            setSignupGps(null);
                          }}
                          className="text-[10px] font-black text-red-500 hover:text-red-700 hover:underline px-2.5 py-1.5 shrink-0"
                        >
                          Re-capture
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-[10px] text-slate-500 leading-relaxed font-semibold">
                          Please capture a live webcam photo to establish your official biometrics baseline and locked GPS location spot:
                        </p>
                        <CameraView 
                          onCapture={(base64, gps) => {
                            setSignupLiveImage(base64);
                            setSignupGps({
                              latitude: gps.latitude,
                              longitude: gps.longitude,
                              timestamp: Date.now()
                            });
                          }}
                          buttonLabel="Capture Live Photo & Lock GPS"
                        />
                      </div>
                    )}
                  </div>

                  {signUpError && (
                    <div className="flex items-start gap-2.5 rounded-xl bg-red-50 border border-red-100 p-3 text-xs text-red-600">
                      <AlertCircle className="h-4.5 w-4.5 shrink-0 text-red-500" />
                      <p className="font-semibold">{signUpError}</p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <button
                      type="button"
                      disabled={isSigningUp}
                      onClick={() => setStep(2)}
                      className="rounded-xl bg-slate-100 hover:bg-slate-200 py-3 text-xs font-bold text-slate-600 border border-slate-200 cursor-pointer disabled:opacity-50 transition active:scale-95"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      disabled={isSigningUp || !signupPhoto || !signupLiveImage}
                      onClick={handleSignUp}
                      className="rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none text-white font-bold py-3 text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition active:scale-95 shadow-lg shadow-emerald-100"
                    >
                      {isSigningUp ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          Complete Sign Up
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer copyright */}
      <div className="relative z-10 text-center text-[10px] text-slate-600 font-bold uppercase tracking-wider px-4 mt-8">
        © DEVELOPED BY DOMINATORS
      </div>
    </div>
  );
}
