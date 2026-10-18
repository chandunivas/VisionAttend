/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Users, Calendar, Download, Eye, FileSpreadsheet, MapPin, Search, 
  UserCheck, LogOut, CheckCircle2, User, Phone, Mail, Award, XCircle, ShieldAlert,
  Info, FileText, CheckCircle, RefreshCw, Filter, Shield, BookOpen, CreditCard, Check, X, ArrowLeft,
  Target, Sliders, Plus, Minus, Save, CalendarDays
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { db, OperationType, handleFirestoreError } from "../firebase";
import { collection, query, where, onSnapshot, getDocs, doc, setDoc, deleteDoc } from "firebase/firestore";
import { StudentProfile, AttendanceRecord, FacultyProfile } from "../types";

interface FacultyDashboardProps {
  faculty: FacultyProfile;
  onLogout: () => void;
}

export default function FacultyDashboard({ faculty, onLogout }: FacultyDashboardProps) {
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<StudentProfile | null>(null);

  // Layout Tab selection: "assigned" | "attendance" | "working_days" | null
  const [activeTab, setActiveTab] = useState<"assigned" | "attendance" | "working_days" | null>(null);

  // Real-time working days configuration map
  const [workingDaysConfigs, setWorkingDaysConfigs] = useState<Record<string, number>>({});
  const [editingMonth, setEditingMonth] = useState<string>(new Date().toISOString().substring(0, 7));
  const [editingWorkingDays, setEditingWorkingDays] = useState<number>(26);
  const [saveStatus, setSaveStatus] = useState<string>("");

  // Export modal and date filtering states
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportDateMode, setExportDateMode] = useState<"all" | "today" | "yesterday" | "single" | "range">("all");
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");

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

  const formatMonthKey = (key: string) => {
    if (!key || key === "all") return "";
    const parts = key.split("-");
    if (parts.length !== 2) return key;
    const year = parts[0];
    const month = parseInt(parts[1], 10);
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];
    return `${months[month - 1]} ${year}`;
  };

  // Synchronize editing working days whenever the selected month or saved configs change
  useEffect(() => {
    if (editingMonth) {
      const savedVal = workingDaysConfigs[editingMonth];
      if (savedVal !== undefined) {
        setEditingWorkingDays(savedVal);
      } else {
        setEditingWorkingDays(getWorkingDaysInMonth(editingMonth));
      }
    }
  }, [editingMonth, workingDaysConfigs]);

  // Attendance status filter: "all", "present", "absent", "not_marked"
  const [attendanceFilter, setAttendanceFilter] = useState<"all" | "present" | "absent" | "not_marked">("all");

  const getTodayDateStr = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const todayStr = getTodayDateStr();

  // 1. Fetch faculty's corresponding students
  useEffect(() => {
    const studentsRef = collection(db, "students");
    const q = query(studentsRef, where("facultyName", "==", faculty.name));

    const unsubscribeStudents = onSnapshot(q, (snapshot) => {
      const studentList: StudentProfile[] = [];
      snapshot.forEach((docSnap) => {
        studentList.push(docSnap.data() as StudentProfile);
      });
      setStudents(studentList);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `students/faculty/${faculty.name}`);
    });

    return () => unsubscribeStudents();
  }, [faculty.name]);

  // 2. Fetch real-time attendance of corresponding students (in-memory filtering to support unlimited students)
  useEffect(() => {
    if (students.length === 0) {
      setAttendance([]);
      return;
    }

    const attendanceRef = collection(db, "attendance");

    const unsubscribeAttendance = onSnapshot(attendanceRef, (snapshot) => {
      const attendanceList: AttendanceRecord[] = [];
      const studentIdsSet = new Set(students.map((s) => s.id));

      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as AttendanceRecord;
        if (studentIdsSet.has(data.studentId)) {
          attendanceList.push({ ...data, id: docSnap.id });
        }
      });

      // Sort attendance logs: most recent first
      attendanceList.sort((a, b) => b.timestamp - a.timestamp);
      setAttendance(attendanceList);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `attendance/faculty/${faculty.name}`);
    });

    return () => unsubscribeAttendance();
  }, [students]);

  // 3. Fetch real-time working days configuration
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

  // Calculate student attendance status for today
  const getStudentTodayStatus = (studentId: string) => {
    const record = attendance.find((r) => r.studentId === studentId && r.date === todayStr);
    if (!record) return "not_marked";
    return record.status === "Present" ? "present" : "absent";
  };

  const getStudentTodayRecord = (studentId: string) => {
    return attendance.find((r) => r.studentId === studentId && r.date === todayStr) || null;
  };

  // Manual Status Override Action
  const handleManualStatusUpdate = async (student: StudentProfile, targetStatus: "Present" | "Absent" | "Not Marked") => {
    const attendanceId = `${student.id}_${todayStr}`;
    const attendanceDocRef = doc(db, "attendance", attendanceId);

    try {
      if (targetStatus === "Not Marked") {
        await deleteDoc(attendanceDocRef);
      } else {
        const record: AttendanceRecord = {
          id: attendanceId,
          studentId: student.id,
          studentName: `${student.firstName} ${student.lastName}`,
          branch: student.branch,
          date: todayStr,
          timestamp: Date.now(),
          status: targetStatus === "Present" ? "Present" : "Absent",
          gps: student.originalGps || student.signupGps || { latitude: 0, longitude: 0, bypassed: true },
          verificationConfidence: 100, // Faculty override confidence
          selfieBase64: student.photoUrl || "",
          livenessPassed: true,
          livenessChallenge: "Faculty Override",
          livenessDetails: `Manually marked as ${targetStatus} by ${faculty.name} on faculty console.`
        };
        await setDoc(attendanceDocRef, record);
      }
    } catch (error) {
      console.error("Failed to update attendance status:", error);
      alert("Failed to update student attendance.");
    }
  };

  const handleSaveWorkingDays = async () => {
    if (!editingMonth) return;
    setSaveStatus("Saving configuration to database...");
    try {
      const configDocRef = doc(db, "working_days_config", editingMonth);
      await setDoc(configDocRef, {
        workingDays: editingWorkingDays,
        updatedAt: Date.now(),
        updatedBy: faculty.name,
      });
      setSaveStatus("Successfully saved! Student portals updated.");
      setTimeout(() => setSaveStatus(""), 4000);
    } catch (err: any) {
      console.error("Error saving working days config:", err);
      setSaveStatus("Failed to save config. Please try again.");
    }
  };

  const handleClearWorkingDays = async (monthKey: string) => {
    try {
      const configDocRef = doc(db, "working_days_config", monthKey);
      await deleteDoc(configDocRef);
      setSaveStatus(`Reset ${formatMonthKey(monthKey)} to standard calendar default.`);
      setTimeout(() => setSaveStatus(""), 4000);
    } catch (err: any) {
      console.error("Error clearing working days config:", err);
    }
  };

  const getYesterdayDateStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Download Attendance Excel (CSV Format)
  const downloadAttendanceExcel = () => {
    if (attendance.length === 0) {
      alert("No attendance records to export.");
      return;
    }

    let filtered = [...attendance];

    if (exportDateMode === "today") {
      filtered = filtered.filter((rec) => rec.date === todayStr);
    } else if (exportDateMode === "yesterday") {
      const yesterdayStr = getYesterdayDateStr();
      filtered = filtered.filter((rec) => rec.date === yesterdayStr);
    } else if (exportDateMode === "single") {
      if (!exportStartDate) {
        alert("Please select a date for export.");
        return;
      }
      filtered = filtered.filter((rec) => rec.date === exportStartDate);
    } else if (exportDateMode === "range") {
      if (!exportStartDate || !exportEndDate) {
        alert("Please select both start and end dates for export.");
        return;
      }
      filtered = filtered.filter((rec) => rec.date >= exportStartDate && rec.date <= exportEndDate);
    }

    if (filtered.length === 0) {
      alert("No attendance records found for the selected date criteria.");
      return;
    }

    // Build CSV content
    const headers = ["Student ID", "Student Name", "Branch", "Date", "Time", "Status", "Latitude", "Longitude", "Confidence Match"];
    const rows = filtered.map((rec) => {
      const formattedTime = new Date(rec.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      return [
        rec.studentId,
        rec.studentName,
        rec.branch,
        rec.date,
        formattedTime,
        rec.status,
        rec.gps?.latitude?.toFixed(6) || "N/A",
        rec.gps?.longitude?.toFixed(6) || "N/A",
        `${rec.verificationConfidence}%`
      ];
    });

    const csvContent = [headers, ...rows].map((row) => row.map((val) => `"${val}"`).join(",")).join("\n");
    const blob = new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    link.href = url;
    const downloadLabel = exportDateMode === "all" ? "Complete" : exportDateMode.toUpperCase();
    link.setAttribute("download", `Attendance_${downloadLabel}_${faculty.name.replace(/\s+/g, "_")}_${new Date().toLocaleDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsExportModalOpen(false);
  };

  // Filter students for ASSIGNED STUDENTS view
  const filteredAssignedStudents = students.filter((student) => {
    if (!student) return false;
    const firstName = student.firstName || "";
    const lastName = student.lastName || "";
    const id = student.id || "";
    const branch = student.branch || "";
    const query = searchQuery || "";

    const fullName = `${firstName} ${lastName}`.toLowerCase();
    return (
      fullName.includes(query.toLowerCase()) ||
      id.toLowerCase().includes(query.toLowerCase()) ||
      branch.toLowerCase().includes(query.toLowerCase())
    );
  });

  // Filter students for ABSENT/PRESENT view
  const filteredAttendanceStudents = students.filter((student) => {
    if (!student) return false;
    const firstName = student.firstName || "";
    const lastName = student.lastName || "";
    const id = student.id || "";
    const query = searchQuery || "";

    const fullName = `${firstName} ${lastName}`.toLowerCase();
    const matchesSearch = fullName.includes(query.toLowerCase()) || id.toLowerCase().includes(query.toLowerCase());
    if (!matchesSearch) return false;

    const status = getStudentTodayStatus(id);
    if (attendanceFilter === "all") return true;
    return status === attendanceFilter;
  });

  // Calculate metrics
  const totalCount = students.length;
  const presentCount = students.filter((s) => getStudentTodayStatus(s.id) === "present").length;
  const absentCount = students.filter((s) => getStudentTodayStatus(s.id) === "absent").length;
  const notMarkedCount = students.filter((s) => getStudentTodayStatus(s.id) === "not_marked").length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 rounded-[2rem] bg-white p-6 border border-slate-100 shadow-xl backdrop-blur-sm mb-8 text-slate-800">
        <div>
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-bold text-indigo-600 uppercase tracking-widest border border-indigo-100">
            Faculty Coordinator
          </span>
          <h1 className="text-2xl font-black tracking-tight text-slate-800 mt-2">
            Coordinator Portal: {faculty.name}
          </h1>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Department: <span className="font-extrabold text-indigo-600">{faculty.branch}</span> • Active Supervision: <span className="font-extrabold text-slate-800">{students.length}</span> students
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-100 shadow-lg shadow-indigo-100 px-4 py-3 text-xs font-bold text-white transition active:scale-95 cursor-pointer"
          >
            <Download className="h-4 w-4" /> Export Ledger (CSV)
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-2 rounded-xl bg-slate-50 hover:bg-slate-100 hover:text-red-600 px-4 py-3 text-xs font-bold text-slate-600 border border-slate-200 transition active:scale-95 cursor-pointer"
          >
            <LogOut className="h-4 w-4" /> Log Out
          </button>
        </div>
      </div>

      {/* Back to Options Navigation */}
      {activeTab !== null && (
        <div className="mb-6">
          <button
            type="button"
            onClick={() => {
              setActiveTab(null);
              setSearchQuery("");
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-4 py-2.5 text-xs font-black text-indigo-600 hover:bg-indigo-50 hover:shadow-indigo-50/50 shadow-md transition active:scale-95 cursor-pointer"
          >
            ← Back to Portal Options
          </button>
        </div>
      )}

      {/* Dynamic Views */}
      <AnimatePresence mode="wait">
        {activeTab === null ? (
          <motion.div
            key="dashboard-home"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 py-4"
          >
            {/* OPTION 1: ASSIGNED STUDENTS */}
            <button
              type="button"
              id="card-option-assigned"
              onClick={() => setActiveTab("assigned")}
              className="group text-left rounded-[2.5rem] border border-slate-100 bg-white p-8 shadow-xl hover:shadow-2xl transition-all duration-300 hover:border-indigo-200 cursor-pointer flex flex-col justify-between min-h-[280px] text-slate-800"
            >
              <div className="space-y-4">
                <div className="inline-flex rounded-2xl bg-indigo-50 p-4 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
                  <Users className="h-8 w-8" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-black text-slate-800 tracking-tight group-hover:text-indigo-600 transition-colors">
                    Assigned Students
                  </h3>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    View all of your assigned student details. Monitor complete academic rosters, contact details, date of birth, tuition remaining balance, semester status, active backlogs, and secure biometrics or signature reference keys.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between border-t border-slate-50 pt-4 text-xs font-bold text-indigo-600 group-hover:underline">
                <span>View {students.length} Supervised Students</span>
                <span className="font-extrabold text-indigo-600">Open Roster →</span>
              </div>
            </button>

            {/* OPTION 2: ABSENT/PRESENT */}
            <button
              type="button"
              id="card-option-attendance"
              onClick={() => setActiveTab("attendance")}
              className="group text-left rounded-[2.5rem] border border-slate-100 bg-white p-8 shadow-xl hover:shadow-2xl transition-all duration-300 hover:border-indigo-200 cursor-pointer flex flex-col justify-between min-h-[280px] text-slate-800"
            >
              <div className="space-y-4">
                <div className="inline-flex rounded-2xl bg-emerald-50 p-4 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-300">
                  <UserCheck className="h-8 w-8" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-black text-slate-800 tracking-tight group-hover:text-emerald-600 transition-colors">
                    Absent / Present (Today)
                  </h3>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    Monitor real-time student check-ins for today. Filter immediately by students who marked as Present, Absent, or Not Marked yet. Complete secure GPS telemetry verification checks and issue manual coordinator status overrides.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between border-t border-slate-50 pt-4 text-xs font-bold text-emerald-600 group-hover:underline">
                <div className="flex gap-3 text-[10px] text-slate-400">
                  <span>Present: <strong className="text-emerald-600 font-bold">{presentCount}</strong></span>
                  <span>Absent: <strong className="text-red-500 font-bold">{absentCount}</strong></span>
                  <span>Not Marked: <strong className="text-amber-500 font-bold">{notMarkedCount}</strong></span>
                </div>
                <span className="font-extrabold text-emerald-600">View Real-Time Matrix →</span>
              </div>
            </button>

            {/* OPTION 3: ATTENDANCE MANAGER */}
            <button
              type="button"
              id="card-option-working-days"
              onClick={() => setActiveTab("working_days")}
              className="group text-left rounded-[2.5rem] border border-slate-100 bg-white p-8 shadow-xl hover:shadow-2xl transition-all duration-300 hover:border-indigo-200 cursor-pointer flex flex-col justify-between min-h-[280px] text-slate-800"
            >
              <div className="space-y-4">
                <div className="inline-flex rounded-2xl bg-indigo-50 p-4 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
                  <Target className="h-8 w-8" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-black text-slate-800 tracking-tight group-hover:text-indigo-600 transition-colors">
                    Attendance Manager
                  </h3>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    Configure the scheduled working days for each calendar month. This updates the baseline and calculation targets for all supervised students immediately.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between border-t border-slate-50 pt-4 text-xs font-bold text-indigo-600 group-hover:underline">
                <span>Configure Working Days</span>
                <span className="font-extrabold text-indigo-600">Open Manager →</span>
              </div>
            </button>
          </motion.div>
        ) : activeTab === "assigned" ? (
          <motion.div
            key="assigned-tab"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* SEARCH AND TITLE BAR */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-[1.5rem] border border-slate-100 shadow-md">
              <div>
                <h2 className="text-md font-extrabold text-slate-800 flex items-center gap-2">
                  <Users className="h-5 w-5 text-indigo-600" /> Complete Roster & Student Profiles
                </h2>
                <p className="text-[11px] text-slate-400 font-bold mt-0.5">
                  Browse legal names, contacts, tuition, backlogs, and biometric keys.
                </p>
              </div>

              <div className="relative w-full md:w-72">
                <Search className="absolute top-3 left-3.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name, roll ID, or branch..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 px-10 py-2.5 text-xs font-bold text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* ROSTER CONTAINER */}
            {filteredAssignedStudents.length === 0 ? (
              <div className="text-center py-16 bg-white border border-dashed border-slate-200 rounded-[2rem] text-slate-400 shadow-sm">
                <Users className="mx-auto mb-3 h-12 w-12 opacity-30" />
                <p className="text-sm font-extrabold">No assigned students found.</p>
                <p className="text-xs text-slate-400 mt-1">Try refining your search keyword or check other sections.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredAssignedStudents.map((student, idx) => {
                  const sLogs = attendance.filter((a) => a.studentId === student.id);
                  const sPresent = sLogs.filter((a) => a.status === "Present").length;
                  const attPercent = sLogs.length > 0 ? Math.round((sPresent / sLogs.length) * 100) : 0;

                  return (
                    <div
                      key={`${student.id || "student"}-${idx}`}
                      className="group relative overflow-hidden rounded-[2rem] border border-slate-100 bg-white p-5 shadow-lg transition-all hover:border-slate-200 hover:shadow-xl flex flex-col justify-between gap-4 text-slate-800"
                    >
                      {/* Top Row: Quick Profile */}
                      <div className="flex items-start gap-4">
                        <div className="relative h-16 w-16 overflow-hidden rounded-xl border border-slate-100 bg-slate-50 shrink-0">
                          <img
                            src={student.photoUrl || "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="}
                            alt="Student Avatar"
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="inline-flex items-center rounded-md bg-indigo-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-indigo-700 border border-indigo-100 mb-1">
                            {student.branch} • Sem {student.semester}
                          </span>
                          <h3 className="text-md font-black text-slate-800 truncate">
                            {student.firstName} {student.lastName}
                          </h3>
                          <p className="text-xs font-mono font-bold text-indigo-600 mt-0.5">
                            ID: {student.id}
                          </p>
                        </div>
                      </div>

                      {/* Middle Grid: Detailed Student Demographics */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-3 bg-slate-50/70 p-3.5 rounded-xl border border-slate-100 text-[11px] font-semibold text-slate-600">
                        <div className="space-y-0.5">
                          <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider">DOB:</span>
                          <p className="text-slate-850 truncate">{student.dob || "N/A"}</p>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider">Email ID:</span>
                          <p className="text-slate-850 truncate">{student.email || "N/A"}</p>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider">Mobile Number:</span>
                          <p className="text-slate-850 truncate">{student.mobile || "N/A"}</p>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider">Backlogs:</span>
                          <p className={`font-black ${student.backlogs > 0 ? "text-red-600" : "text-emerald-600"}`}>
                            {student.backlogs} {student.backlogs === 0 ? "• Clear" : "Modules"}
                          </p>
                        </div>
                        <div className="space-y-0.5 col-span-2 border-t border-slate-100 pt-2 grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider">Father's Name:</span>
                            <p className="text-slate-850 truncate">{student.fatherName || "N/A"}</p>
                          </div>
                          <div>
                            <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider">Father's Mobile:</span>
                            <p className="text-slate-850 truncate">{student.fatherNumber || "N/A"}</p>
                          </div>
                        </div>
                        <div className="space-y-0.5 col-span-2 border-t border-slate-100 pt-2 grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider">Mother's Name:</span>
                            <p className="text-slate-850 truncate">{student.motherName || "N/A"}</p>
                          </div>
                          <div>
                            <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider">Mother's Mobile:</span>
                            <p className="text-slate-850 truncate">{student.motherNumber || "N/A"}</p>
                          </div>
                        </div>
                        <div className="space-y-0.5 col-span-2 border-t border-slate-100 pt-2 grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider">Tuition Balance:</span>
                            <p className="text-slate-850 truncate font-extrabold text-red-600">₹{(student.feesRemaining || 0).toLocaleString("en-IN")}</p>
                          </div>
                          <div>
                            <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider">Status:</span>
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-black uppercase border ${
                              student.feesStatus === "Paid"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                                : "bg-amber-50 text-amber-700 border-amber-100"
                            }`}>
                              {student.feesStatus || "Pending"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Action trigger footer */}
                      <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                        <div className="text-[10px] font-black text-indigo-600">
                          ATTENDANCE RATE: {attPercent}%
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedStudent(student)}
                          className="flex items-center gap-1.5 text-xs font-black text-indigo-600 hover:text-indigo-700 hover:underline transition cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5" /> View Biometrics particularly
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        ) : activeTab === "attendance" ? (
          <motion.div
            key="attendance-tab"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* METRICS & QUICK COUNTERS */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-white p-5 rounded-[1.5rem] border border-slate-100 shadow-md">
              <div className="rounded-xl bg-slate-50 p-3 border border-slate-100 text-center">
                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Total Supervised</span>
                <p className="text-xl font-black text-slate-800 mt-0.5">{totalCount}</p>
              </div>
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-center">
                <span className="text-[10px] text-emerald-600 font-extrabold uppercase tracking-wider">Present Today</span>
                <p className="text-xl font-black text-emerald-700 mt-0.5">{presentCount}</p>
              </div>
              <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-center">
                <span className="text-[10px] text-red-600 font-extrabold uppercase tracking-wider">Absent Today</span>
                <p className="text-xl font-black text-red-700 mt-0.5">{absentCount}</p>
              </div>
              <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-center">
                <span className="text-[10px] text-amber-600 font-extrabold uppercase tracking-wider">Not Marked Yet</span>
                <p className="text-xl font-black text-amber-700 mt-0.5">{notMarkedCount}</p>
              </div>
            </div>

            {/* SELECTION FILTERS & SEARCH */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-[1.5rem] border border-slate-100 shadow-md">
              {/* STATUS FILTER PILLS */}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setAttendanceFilter("all")}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition border cursor-pointer ${
                    attendanceFilter === "all"
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                      : "bg-slate-50 text-slate-500 border-slate-200 hover:text-slate-800"
                  }`}
                >
                  All ({totalCount})
                </button>
                <button
                  type="button"
                  onClick={() => setAttendanceFilter("present")}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition border cursor-pointer ${
                    attendanceFilter === "present"
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                      : "bg-slate-50 text-slate-500 border-slate-200 hover:text-slate-800"
                  }`}
                >
                  Present ({presentCount})
                </button>
                <button
                  type="button"
                  onClick={() => setAttendanceFilter("absent")}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition border cursor-pointer ${
                    attendanceFilter === "absent"
                      ? "bg-red-600 text-white border-red-600 shadow-sm"
                      : "bg-slate-50 text-slate-500 border-slate-200 hover:text-slate-800"
                  }`}
                >
                  Absent ({absentCount})
                </button>
                <button
                  type="button"
                  onClick={() => setAttendanceFilter("not_marked")}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition border cursor-pointer ${
                    attendanceFilter === "not_marked"
                      ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                      : "bg-slate-50 text-slate-500 border-slate-200 hover:text-slate-800"
                  }`}
                >
                  Not Marked ({notMarkedCount})
                </button>
              </div>

              {/* SEARCH BOX */}
              <div className="relative w-full md:w-64">
                <Search className="absolute top-3 left-3.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by student..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 px-10 py-2 text-xs font-bold text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* ATTENDANCE MATRIX ROW */}
            {filteredAttendanceStudents.length === 0 ? (
              <div className="text-center py-16 bg-white border border-dashed border-slate-200 rounded-[2rem] text-slate-400 shadow-sm">
                <Calendar className="mx-auto mb-3 h-12 w-12 opacity-30" />
                <p className="text-sm font-extrabold">No students match the active status filter.</p>
                <p className="text-xs text-slate-400 mt-1">Adjust filters or type another search criteria.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredAttendanceStudents.map((student, idx) => {
                  const status = getStudentTodayStatus(student.id);
                  const record = getStudentTodayRecord(student.id);

                  return (
                    <div
                      key={`${student.id || "student"}-${idx}`}
                      className="rounded-[1.5rem] border border-slate-100 bg-white p-4 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4 text-slate-800"
                    >
                      {/* Name & ID column */}
                      <div className="flex items-center gap-3">
                        <img
                          src={student.photoUrl || "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="}
                          alt={student.firstName}
                          className="h-11 w-11 rounded-lg object-cover border border-slate-200"
                        />
                        <div>
                          <h4 className="text-sm font-black text-slate-800">
                            {student.firstName} {student.lastName}
                          </h4>
                          <p className="text-xs font-mono font-bold text-indigo-600">
                            ID: {student.id} • {student.branch}
                          </p>
                        </div>
                      </div>

                      {/* Realtime Attendance status badge & time */}
                      <div className="flex flex-col md:items-center text-left md:text-center shrink-0">
                        {status === "present" && record ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-700 border border-emerald-100">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              PRESENT
                            </span>
                            <p className="text-[10px] text-slate-400 font-semibold font-mono">
                              Clocked at: {new Date(record.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        ) : status === "absent" && record ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-[11px] font-black text-red-700 border border-red-100">
                              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse"></span>
                              ABSENT
                            </span>
                            <p className="text-[10px] text-slate-400 font-semibold">
                              Reported as absent
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-black text-amber-700 border border-amber-100">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                              NOT MARKED YET
                            </span>
                            <p className="text-[10px] text-slate-400 font-semibold">
                              Pending verification
                            </p>
                          </div>
                        )}
                      </div>

                      {/* GPS Range Details Check */}
                      <div className="text-xs max-w-xs shrink-0 font-medium">
                        {record?.gps ? (
                          <div className="bg-slate-50 border border-slate-250/50 p-2.5 rounded-xl font-mono text-[10px] space-y-1 text-slate-600">
                            <p className="flex items-center gap-1 font-bold text-slate-800">
                              <MapPin className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                              {record.gps.bypassed ? "Indoor Signal Bypass" : `${record.gps.latitude.toFixed(5)}, ${record.gps.longitude.toFixed(5)}`}
                            </p>
                            <p className="text-slate-500 text-[9px] font-sans">
                              {record.livenessDetails || "Verified GPS coordinate lock."}
                            </p>
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-400 font-semibold italic">
                            No telemetry logs submitted today.
                          </p>
                        )}
                      </div>

                      {/* Manual overriding trigger controls */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleManualStatusUpdate(student, "Present")}
                          className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                            status === "present"
                              ? "bg-emerald-600 text-white border-emerald-600 border shadow-sm"
                              : "bg-slate-50 text-slate-600 border border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-100"
                          }`}
                        >
                          <Check className="h-3.5 w-3.5" /> Mark Present
                        </button>
                        <button
                          type="button"
                          onClick={() => handleManualStatusUpdate(student, "Absent")}
                          className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                            status === "absent"
                              ? "bg-red-600 text-white border-red-600 border shadow-sm"
                              : "bg-slate-50 text-slate-600 border border-slate-200 hover:bg-red-50 hover:text-red-700 hover:border-red-100"
                          }`}
                        >
                          <X className="h-3.5 w-3.5" /> Mark Absent
                        </button>
                        {(status === "present" || status === "absent") && (
                          <button
                            type="button"
                            onClick={() => handleManualStatusUpdate(student, "Not Marked")}
                            className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 hover:text-amber-600 text-slate-400 border border-slate-200 transition cursor-pointer"
                            title="Reset Status"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="working-days-tab"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* WORK DAYS EDITOR HERO */}
            <div className="bg-white p-8 rounded-[2rem] border border-slate-150 shadow-xl space-y-6 text-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                <div>
                  <h2 className="text-lg font-black text-slate-850 flex items-center gap-2">
                    <Sliders className="h-5 w-5 text-indigo-600 animate-pulse" /> Monthly Attendance Manager
                  </h2>
                  <p className="text-xs text-slate-400 font-medium mt-1">
                    Manage baseline scheduled working days per calendar month (excluding Sundays by default).
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-black uppercase tracking-wider text-indigo-750 border border-indigo-150 self-start sm:self-auto">
                  <Target className="h-3.5 w-3.5" /> Coordinator Mode
                </span>
              </div>

              {/* EDITOR GRID */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Parameter inputs */}
                <div className="space-y-6">
                  {/* Month Selection */}
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-widest text-slate-500 block">
                      Target Calendar Month
                    </label>
                    <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
                      Select the specific month you would like to define customized class days for.
                    </p>
                    <input
                      type="month"
                      value={editingMonth}
                      onChange={(e) => {
                        setEditingMonth(e.target.value);
                        setSaveStatus("");
                      }}
                      className="w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    />
                  </div>

                  {/* Working Days Configurator Slider */}
                  <div className="space-y-3 bg-slate-50/50 rounded-2xl border border-slate-100 p-5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-black uppercase tracking-widest text-slate-500">
                        Scheduled Working Days
                      </label>
                      <span className="text-indigo-600 font-mono font-black text-sm bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-lg">
                        {editingWorkingDays} Days
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
                      Exclude holidays or weekends manually. Standard calculated default for {formatMonthKey(editingMonth)} is <strong className="text-slate-600 font-bold">{getWorkingDaysInMonth(editingMonth)} working days</strong> (Sundays excluded).
                    </p>
                    <div className="flex items-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setEditingWorkingDays(prev => Math.max(1, prev - 1))}
                        className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition cursor-pointer active:scale-95"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <input
                        type="range"
                        min="1"
                        max="31"
                        value={editingWorkingDays}
                        onChange={(e) => setEditingWorkingDays(parseInt(e.target.value, 10))}
                        className="flex-1 accent-indigo-600 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                      />
                      <button
                        type="button"
                        onClick={() => setEditingWorkingDays(prev => Math.min(31, prev + 1))}
                        className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition cursor-pointer active:scale-95"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Actions Block */}
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={handleSaveWorkingDays}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-100 shadow-lg px-4 py-3 text-xs font-bold text-white transition active:scale-95 cursor-pointer"
                    >
                      <Save className="h-4 w-4" /> Save Configuration to Database
                    </button>

                    {saveStatus && (
                      <p className={`text-xs font-black text-center ${saveStatus.includes("Successfully") || saveStatus.includes("Reset") ? "text-emerald-600 animate-pulse" : "text-indigo-600"}`}>
                        {saveStatus}
                      </p>
                    )}
                  </div>
                </div>

                {/* Helpful Hints info card */}
                <div className="bg-slate-50 rounded-2xl border border-slate-150 p-6 flex flex-col justify-between">
                  <div className="space-y-4 text-slate-600 text-xs leading-relaxed font-semibold">
                    <div className="flex items-start gap-2.5">
                      <Info className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-extrabold text-slate-800 uppercase tracking-wider text-[10px]">How this impacts students</p>
                        <p className="mt-1 text-slate-500 font-medium">
                          Students will see the configured working days reflected in their monthly attendance summaries in real-time.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-extrabold text-slate-800 uppercase tracking-wider text-[10px]">Real-Time Syncing</p>
                        <p className="mt-1 text-slate-500 font-medium">
                          All changes saved to the Firestore database propagate in real-time. Students and other coordinators do not need to refresh their browsers to inspect the updated ledger calculation baselines.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-200/60 pt-4 mt-6 text-[10px] text-slate-400 font-extrabold uppercase tracking-wider flex items-center justify-between">
                    <span>Active Department</span>
                    <span className="text-indigo-600">{faculty.branch}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* SAVED CONFIGURATIONS OVERVIEW */}
            <div className="bg-white p-6 rounded-[2rem] border border-slate-150 shadow-lg space-y-4 text-slate-800">
              <h3 className="text-md font-black text-slate-800 flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-indigo-600" /> Customized Months Overview
              </h3>
              <p className="text-xs text-slate-400 font-medium leading-relaxed">
                Below are the custom working days configured for each month. Student attendance percentages for these months are computed using these active settings.
              </p>

              {Object.keys(workingDaysConfigs).length === 0 ? (
                <div className="text-center py-8 bg-slate-50 border border-slate-100 rounded-xl text-slate-400 font-semibold text-xs">
                  No customized months registered. Standard calendar defaults (excluding Sundays) are currently being applied.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {Object.entries(workingDaysConfigs).map(([monthKey, days]) => (
                    <div key={monthKey} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-black text-slate-800">{formatMonthKey(monthKey)}</p>
                        <p className="text-[10px] text-slate-400 font-bold font-mono">ID: {monthKey}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-indigo-750 border border-indigo-100">
                          {days} Days
                        </span>
                        <button
                          type="button"
                          onClick={() => handleClearWorkingDays(monthKey)}
                          className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-red-50 hover:text-red-600 text-slate-400 transition cursor-pointer active:scale-95"
                          title="Restore default"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pop-up Biometrics Particularly View Drawer */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-md overflow-y-auto">
          <motion.div
            initial={{ scale: 0.93, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.93, opacity: 0, y: 30 }}
            className="w-full max-w-lg overflow-hidden rounded-[2.5rem] border border-slate-100 bg-white shadow-2xl text-slate-800 my-8 max-h-[90vh] flex flex-col"
          >
            {/* Drawer Header */}
            <div className="bg-slate-50 p-6 flex items-center justify-between border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <img 
                    src={selectedStudent.photoUrl || "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="} 
                    alt="Biometric Profile Photo" 
                    className="h-full w-full object-cover"
                  />
                </div>
                <div>
                  <h3 className="text-md font-black text-slate-800">
                    {selectedStudent.firstName} {selectedStudent.lastName}
                  </h3>
                  <p className="text-xs font-mono font-bold text-indigo-600">
                    ID: {selectedStudent.id} • {selectedStudent.branch}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStudent(null)}
                className="text-slate-500 hover:text-slate-800 text-xs font-bold bg-white hover:bg-slate-50 px-3.5 py-1.5 rounded-xl border border-slate-200 transition cursor-pointer"
              >
                Close Profile
              </button>
            </div>

            {/* Drawer Body - Scrollable */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              
              {/* Profile Details Block */}
              <div>
                <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-3">
                  Biometrics & Contact Details
                </h4>
                <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
                  <div>
                    <span className="text-slate-400 font-bold">Mail ID:</span>
                    <p className="font-semibold text-slate-850 truncate">{selectedStudent.email}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold">Mobile:</span>
                    <p className="font-semibold text-slate-850">{selectedStudent.mobile || "Not registered"}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold">Date of Birth:</span>
                    <p className="font-semibold text-slate-850">{selectedStudent.dob}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold">Gender:</span>
                    <p className="font-semibold text-slate-850 capitalize">{selectedStudent.gender || "Not specified"}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold">In-charge Coordinator:</span>
                    <p className="font-semibold text-indigo-600">{selectedStudent.facultyName}</p>
                  </div>
                </div>
              </div>

              {/* Parents Contact Block */}
              <div>
                <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-3">
                  Parents / Guardian Details
                </h4>
                <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
                  <div>
                    <span className="text-slate-400 font-bold">Father's Name:</span>
                    <p className="font-semibold text-slate-850">{selectedStudent.fatherName || "Not provided"}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold">Father's No:</span>
                    <p className="font-semibold text-slate-850">{selectedStudent.fatherNumber || "Not registered"}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold">Mother's Name:</span>
                    <p className="font-semibold text-slate-850">{selectedStudent.motherName || "Not provided"}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold">Mother's No:</span>
                    <p className="font-semibold text-slate-850">{selectedStudent.motherNumber || "Not registered"}</p>
                  </div>
                </div>
              </div>

              {/* Academic & Tuition Block */}
              <div>
                <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-3">
                  Tuition & Academic Standing
                </h4>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mb-0.5">Semester</span>
                    <p className="text-sm font-black text-slate-800">{selectedStudent.semester}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mb-0.5">Backlogs</span>
                    <p className={`text-sm font-black ${selectedStudent.backlogs > 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {selectedStudent.backlogs}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 border border-slate-100 flex flex-col justify-center items-center">
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mb-0.5">Fees Status</span>
                    <span className={`inline-block text-[9px] font-black uppercase rounded px-2 py-0.5 mt-0.5 border ${
                      selectedStudent.feesStatus === "Paid"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                        : "bg-amber-50 text-amber-700 border-amber-100"
                    }`}>
                      {selectedStudent.feesStatus}
                    </span>
                  </div>
                </div>
              </div>

              {/* Secure Biometric & GPS key block */}
              <div>
                <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-3">
                  Secure Biometric & GPS Key Registry
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Face photo reference */}
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-150 text-[11px] space-y-2">
                    <p className="font-extrabold text-slate-500 uppercase tracking-wider text-[9px]">
                      Original Reference Image
                    </p>
                    {selectedStudent.originalLiveImage ? (
                      <div className="flex items-center gap-3">
                        <img 
                          src={selectedStudent.originalLiveImage} 
                          alt="Face check" 
                          className="h-14 w-14 object-cover rounded-xl border border-slate-200"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-800 truncate">Registered Face</p>
                          <p className="text-[9px] text-emerald-600 font-extrabold flex items-center gap-0.5">
                            <Check className="h-3 w-3" /> GPS Key Active
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-slate-400 italic">No Reference Image Established</p>
                    )}
                  </div>

                  {/* Registered Signature */}
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-150 text-[11px] space-y-2">
                    <p className="font-extrabold text-slate-500 uppercase tracking-wider text-[9px]">
                      Registered Signature
                    </p>
                    {selectedStudent.signatureUrl ? (
                      <div className="flex items-center gap-3">
                        <div className="h-14 w-24 bg-white rounded-xl border border-slate-200 flex items-center justify-center p-1 shrink-0">
                          <img 
                            src={selectedStudent.signatureUrl} 
                            alt="Signature check" 
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                        <div>
                          <p className="font-bold text-slate-800">Verifiable Signature</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-slate-400 italic">No Signature Registered</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Historic check-in activity list */}
              <div>
                <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-3">
                  Historic Verification Activity Log
                </h4>
                {attendance.filter((a) => a.studentId === selectedStudent.id).length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-2">
                    No historic verification logs registered.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {attendance
                      .filter((a) => a.studentId === selectedStudent.id)
                      .map((log, idx) => (
                        <div key={`${log.id || "log"}-${idx}`} className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex items-center justify-between text-[11px]">
                          <div>
                            <span className="font-bold text-slate-800 font-mono">{log.date}</span>
                            <span className="text-slate-400 ml-2">
                              {new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-indigo-600">
                              {log.verificationConfidence}% Match
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                              log.status === "Present"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-red-50 text-red-700"
                            }`}>
                              {log.status}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

            </div>
          </motion.div>
        </div>
      )}

      {/* Export Date Filtering Modal */}
      <AnimatePresence>
        {isExportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsExportModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="relative w-full max-w-md overflow-hidden rounded-[2.2rem] border border-slate-100 bg-white p-7 shadow-2xl text-slate-800"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
                <div className="flex items-center gap-2">
                  <div className="rounded-xl bg-indigo-50 p-2 text-indigo-600">
                    <Download className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Export Ledger Options</h3>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Select date-filtering criteria</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsExportModalOpen(false)}
                  className="rounded-full hover:bg-slate-50 p-1.5 text-slate-400 hover:text-slate-700 transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Body Form */}
              <div className="space-y-4">
                {/* Export Options Radio Grid */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Export Date Range Scope</label>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { id: "all", label: "Complete Ledger (All Historic Dates)" },
                      { id: "today", label: "Today Only" },
                      { id: "yesterday", label: "Yesterday Only" },
                      { id: "single", label: "Custom Single Date" },
                      { id: "range", label: "Custom Date Range" }
                    ].map((opt) => (
                      <label
                        key={opt.id}
                        className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-xs font-bold transition cursor-pointer select-none ${
                          exportDateMode === opt.id
                            ? "bg-indigo-50/70 border-indigo-200 text-indigo-900"
                            : "bg-slate-50/50 border-slate-200/80 text-slate-600 hover:bg-slate-100/50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="exportDateMode"
                          value={opt.id}
                          checked={exportDateMode === opt.id}
                          onChange={() => setExportDateMode(opt.id as any)}
                          className="accent-indigo-600 h-3.5 w-3.5"
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Custom Date Picker Fields */}
                {(exportDateMode === "single" || exportDateMode === "range") && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-3 bg-slate-50/70 rounded-2xl border border-slate-100 p-4"
                  >
                    {exportDateMode === "single" ? (
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Select Date</label>
                        <input
                          type="date"
                          value={exportStartDate}
                          onChange={(e) => setExportStartDate(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                        />
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Start Date</label>
                          <input
                            type="date"
                            value={exportStartDate}
                            onChange={(e) => setExportStartDate(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">End Date</label>
                          <input
                            type="date"
                            value={exportEndDate}
                            onChange={(e) => setExportEndDate(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                          />
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Action Controls */}
                <div className="flex gap-3 pt-3 border-t border-slate-50">
                  <button
                    type="button"
                    onClick={() => setIsExportModalOpen(false)}
                    className="flex-1 rounded-2xl bg-slate-100 hover:bg-slate-200 py-3 text-xs font-extrabold text-slate-600 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={downloadAttendanceExcel}
                    className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 py-3 text-xs font-extrabold text-white shadow-lg shadow-indigo-100 transition active:scale-95"
                  >
                    <Download className="h-3.5 w-3.5" /> Download CSV
                  </button>
                </div>
              </div>
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
