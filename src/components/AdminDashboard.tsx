/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  BarChart, Users, Award, ShieldAlert, CreditCard, Download, Search, 
  Trash2, RefreshCw, LogOut, CheckCircle, Database, ServerCrash,
  Filter, CalendarRange, Clock, TrendingUp, MapPinOff, Activity, FileSpreadsheet, Sparkles,
  Upload, X, AlertTriangle, Lock, Eye, Edit, Plus, Camera, MapPin, Image, ArrowLeft
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { db, OperationType, handleFirestoreError, cleanUndefined } from "../firebase";
import { collection, onSnapshot, doc, deleteDoc, setDoc, writeBatch } from "firebase/firestore";
import { StudentProfile, AttendanceRecord, BranchStat } from "../types";
import * as XLSX from "xlsx";
import { EXCEL_STUDENTS_LIST } from "../data";
import { compressImage } from "../utils/imageCompressor";
import CameraView from "./CameraView";

interface AdminDashboardProps {
  onLogout: () => void;
}

export default function AdminDashboard({ onLogout }: AdminDashboardProps) {
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  
  // Search query for the student directory
  const [searchQuery, setSearchQuery] = useState("");
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  // Custom Confirmation Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    confirmText: "Confirm",
    cancelText: "Cancel",
    onConfirm: () => {},
  });

  // CRUD States
  const [isCrudModalOpen, setIsCrudModalOpen] = useState(false);
  const [crudMode, setCrudMode] = useState<"create" | "view" | "edit">("view");
  const [selectedStudentForCrud, setSelectedStudentForCrud] = useState<StudentProfile | null>(null);

  // Form Fields
  const [formId, setFormId] = useState("");
  const [formFirstName, setFormFirstName] = useState("");
  const [formLastName, setFormLastName] = useState("");
  const [formDob, setFormDob] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formMobile, setFormMobile] = useState("");
  const [formBranch, setFormBranch] = useState("CSE");
  const [formSemester, setFormSemester] = useState("Semester 5");
  const [formBacklogs, setFormBacklogs] = useState(0);
  const [formFeesTotal, setFormFeesTotal] = useState(140000);
  const [formFeesPaid, setFormFeesPaid] = useState(0);
  const [formMotherName, setFormMotherName] = useState("");
  const [formFatherName, setFormFatherName] = useState("");
  const [formMotherNumber, setFormMotherNumber] = useState("");
  const [formFatherNumber, setFormFatherNumber] = useState("");
  const [formGender, setFormGender] = useState<"male" | "female" | "">("");
  const [formPassword, setFormPassword] = useState("");
  const [formPhotoUrl, setFormPhotoUrl] = useState("");
  const [formOriginalLiveImage, setFormOriginalLiveImage] = useState("");
  const [formOriginalGps, setFormOriginalGps] = useState<{ latitude: number; longitude: number; accuracy?: number; bypassed?: boolean } | null>(null);
  const [showWebcam, setShowWebcam] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const openCrudModal = (mode: "create" | "view" | "edit", student?: StudentProfile) => {
    setCrudMode(mode);
    if (student) {
      setSelectedStudentForCrud(student);
      setFormId(student.id);
      setFormFirstName(student.firstName || "");
      setFormLastName(student.lastName || "");
      setFormDob(student.dob || "");
      setFormEmail(student.email || "");
      setFormMobile(student.mobile || "");
      setFormBranch(student.branch || "CSE");
      setFormSemester(student.semester || "Semester 5");
      setFormBacklogs(student.backlogs || 0);
      setFormFeesTotal(student.feesTotal || 140000);
      setFormFeesPaid(student.feesPaid || 0);
      setFormMotherName(student.motherName || "");
      setFormFatherName(student.fatherName || "");
      setFormMotherNumber(student.motherNumber || "");
      setFormFatherNumber(student.fatherNumber || "");
      setFormGender(student.gender || "");
      setFormPassword(""); // Default blank for editing unless changed
      setFormPhotoUrl(student.photoUrl || "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=");
      setFormOriginalLiveImage(student.originalLiveImage || "");
      setFormOriginalGps(student.originalGps || null);
      setShowWebcam(false);
    } else {
      setSelectedStudentForCrud(null);
      setFormId("");
      setFormFirstName("");
      setFormLastName("");
      setFormDob("");
      setFormEmail("");
      setFormMobile("");
      setFormBranch("CSE");
      setFormSemester("Semester 5");
      setFormBacklogs(0);
      setFormFeesTotal(140000);
      setFormFeesPaid(0);
      setFormMotherName("");
      setFormFatherName("");
      setFormMotherNumber("");
      setFormFatherNumber("");
      setFormGender("");
      setFormPassword("9876543210"); // Default password
      setFormPhotoUrl("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=");
      setFormOriginalLiveImage("");
      setFormOriginalGps(null);
      setShowWebcam(false);
    }
    setIsCrudModalOpen(true);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formId || !formFirstName) {
      alert("Please fill in Student Roll No/ID and First Name!");
      return;
    }

    setIsSaving(true);
    try {
      const targetId = formId.toUpperCase().trim();
      
      // Calculate remaining and status
      const feesRemaining = Math.max(0, formFeesTotal - formFeesPaid);
      const feesStatus = feesRemaining <= 0 ? "Paid" : "Pending";
      const facultyIncharge = getInchargeFacultyName(formBranch);

      const studentProfile: StudentProfile = {
        id: targetId,
        firstName: formFirstName.trim(),
        lastName: formLastName.trim(),
        dob: formDob,
        email: formEmail.trim() || `${targetId.toLowerCase()}@aietta.ac.in`,
        mobile: formMobile.trim(),
        branch: formBranch,
        semester: formSemester,
        backlogs: Number(formBacklogs),
        feesTotal: Number(formFeesTotal),
        feesPaid: Number(formFeesPaid),
        feesRemaining: feesRemaining,
        feesStatus: feesStatus,
        photoUrl: formPhotoUrl || "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
        facultyName: facultyIncharge,
        motherName: formMotherName.trim(),
        fatherName: formFatherName.trim(),
        motherNumber: formMotherNumber.trim(),
        fatherNumber: formFatherNumber.trim(),
        gender: formGender || "",
        originalLiveImage: formOriginalLiveImage || undefined,
        originalGps: formOriginalGps || undefined,
        createdAt: selectedStudentForCrud?.createdAt || Date.now()
      };

      // Write student profile
      await setDoc(doc(db, "students", targetId), cleanUndefined(studentProfile));

      // If password is set/changed, or creating a new record
      if (crudMode === "create" || formPassword.trim() !== "") {
        const pass = formPassword.trim() !== "" ? formPassword.trim() : (formFatherNumber.trim() || "9876543210");
        await setDoc(doc(db, "accounts", targetId), { password: pass });
      }

      alert(crudMode === "create" ? "Student profile created successfully!" : "Student profile updated successfully!");
      setIsCrudModalOpen(false);
    } catch (err: any) {
      console.error("Error saving student:", err);
      handleFirestoreError(err, OperationType.WRITE, `students/${formId}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Advanced Analytics Filters
  const [selectedBranch, setSelectedBranch] = useState<string>("All");
  const [selectedSemester, setSelectedSemester] = useState<string>("All");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // Excel Bulk Import States
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [parsedStudents, setParsedStudents] = useState<any[]>([]);
  const [importStatus, setImportStatus] = useState<{
    total: number;
    valid: number;
    invalid: number;
    errors: string[];
  } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  const FACULTY_COORDINATORS = [
    { id: "FAC01", name: "Sangitha Mishra", branch: "CSD(Data science)" },
    { id: "FAC02", name: "Lavanya", branch: "CSM-A" },
    { id: "FAC03", name: "Rama", branch: "CSM-B" },
    { id: "FAC04", name: "Rama", branch: "CDM-B" }
  ];

  const getInchargeFacultyName = (branch: string): string => {
    const b = (branch || "").toUpperCase().trim();
    if (b.includes("CSD")) return "Sangitha Mishra";
    if (b.includes("CSM-A")) return "Lavanya";
    if (b.includes("CSM-B") || b.includes("CDM-B") || b.includes("CSM-b") || b.includes("CDM-b")) return "Rama";
    return "Sangitha Mishra"; // Default fallback
  };

  const downloadTemplate = () => {
    const headers = [
      "VissionAttendID", "First Name", "Middle Name", "Last Name", "Date of Birth",
      "Email", "Mobile", "Branch", "Semester", "Backlogs",
      "Fees Total", "Fees Paid", "Mother Name", "Father Name",
      "Mother Number", "Father Number", "Login Password"
    ];
    const sampleRows = [
      [
        "STU03", "Aman", "", "Verma", "2004-08-12",
        "stu03@aietta.ac.in", "9876543212", "CSE", "Semester 5", 0,
        140000, 140000, "Suman Verma", "Ramesh Verma",
        "9876543213", "9876543214", "9876543214"
      ],
      [
        "STU04", "Pooja", "Kumari", "Patel", "2004-03-24",
        "pooja@aietta.ac.in", "9876543215", "ECE", "Semester 5", 1,
        140000, 100000, "Rekha Patel", "Suresh Patel",
        "9876543216", "9876543217", "9876543217"
      ]
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Student_Template");
    XLSX.writeFile(wb, "Student_Registration_Template.xlsx");
  };

  const [isSeedingExcel, setIsSeedingExcel] = useState(false);
  const [seedProgress, setSeedProgress] = useState(0);

  const seedExcelStudents = () => {
    setConfirmDialog({
      isOpen: true,
      title: "Seed Student Database",
      message: "Are you sure you want to seed the database with all 68 student records from the Excel sheets? Existing records with matching IDs will be updated.",
      confirmText: "Seed Database",
      cancelText: "Cancel",
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        setIsSeedingExcel(true);
        setSeedProgress(0);

        try {
          const total = EXCEL_STUDENTS_LIST.length;
          let count = 0;
          const sampleStudentPhoto = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

          // Seed/update faculty incharge definitions too to ensure alignment
          for (const fac of FACULTY_COORDINATORS) {
            const facPassword = fac.id === "FAC01" ? "password01" : fac.id === "FAC02" ? "password02" : fac.id === "FAC03" ? "password03" : "password04";
            await setDoc(doc(db, "faculties", fac.id), {
              id: fac.id,
              name: fac.name,
              branch: fac.branch,
              password: facPassword
            });
          }

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

            await setDoc(doc(db, "students", student.id), cleanUndefined(studentProfile));
            await setDoc(doc(db, "accounts", student.id), { password: student.fatherNumber || student.password || "9876543210" });

            count++;
            setSeedProgress(Math.round((count / total) * 100));
          }

          alert(`Successfully seeded ${count} student profiles and login accounts from the spreadsheet!`);
        } catch (err: any) {
          console.error("Error seeding students:", err);
          alert("Seeding error: " + err.message);
        } finally {
          setIsSeedingExcel(false);
          setSeedProgress(0);
        }
      }
    });
  };

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to array of objects
        const rawJson = XLSX.utils.sheet_to_json<any>(worksheet);
        
        const studentsToRegister: any[] = [];
        const errors: string[] = [];
        let validCount = 0;
        let invalidCount = 0;

        rawJson.forEach((row: any, idx: number) => {
          const normRow: any = {};
          Object.keys(row).forEach(key => {
            const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
            normRow[cleanKey] = row[key];
          });

          const idVal = normRow.id || normRow.appid || normRow.rollnumber || normRow.registrationnumber || normRow.rollno;
          const firstName = normRow.firstname || normRow.name || normRow.studentname || normRow.first;
          const lastName = normRow.lastname || normRow.last || "";
          const dob = normRow.dob || normRow.dateofbirth || normRow.birthday || "2004-01-01";
          const email = normRow.email || normRow.emailaddress || (idVal ? `${String(idVal).toLowerCase().trim()}@aietta.ac.in` : `${Math.random().toString(36).substr(2, 5)}@aietta.ac.in`);
          const mobile = normRow.mobile || normRow.phone || normRow.mobilenumber || normRow.phonenumber || "0000000000";
          const branch = (normRow.branch || normRow.department || "CSE").toUpperCase();
          const semester = normRow.semester || normRow.year || "Semester 5";
          const backlogs = Number(normRow.backlogs || normRow.activebacklogs || 0);
          const feesTotal = Number(normRow.feestotal || normRow.totalfees || 140000);
          const feesPaid = Number(normRow.feespaid || normRow.paidfees || 140000);
          const motherName = normRow.mothername || "Not provided";
          const fatherName = normRow.fathername || "Not provided";
          const motherNumber = normRow.mothernumber || normRow.motherphone || "";
          const fatherNumber = normRow.fathernumber || normRow.fatherphone || "";
          const password = fatherNumber || normRow.password || normRow.loginpassword || "9876543210";

          if (!firstName) {
            invalidCount++;
            errors.push(`Row ${idx + 2}: Missing first name / student name.`);
            return;
          }

          const finalId = idVal ? String(idVal).toUpperCase().trim() : `STU${Math.floor(100 + Math.random() * 900)}`;

          const facultyName = getInchargeFacultyName(branch);

          const feesRemaining = feesTotal - feesPaid;
          const feesStatus = feesRemaining <= 0 ? "Paid" : "Pending";

          const sampleStudentPhoto = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

          studentsToRegister.push({
            id: finalId,
            firstName,
            middleName: normRow.middlename || "",
            lastName,
            dob,
            email,
            mobile,
            branch,
            semester,
            backlogs,
            feesTotal,
            feesPaid,
            feesRemaining,
            feesStatus,
            photoUrl: sampleStudentPhoto,
            facultyName,
            motherName,
            fatherName,
            motherNumber,
            fatherNumber,
            password,
            createdAt: Date.now()
          });
          validCount++;
        });

        setParsedStudents(studentsToRegister);
        setImportStatus({
          total: rawJson.length,
          valid: validCount,
          invalid: invalidCount,
          errors
        });

      } catch (err: any) {
        console.error(err);
        alert("Error parsing excel file: " + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const commitImport = async () => {
    if (parsedStudents.length === 0) return;
    setIsImporting(true);
    setImportProgress(0);

    let successCount = 0;
    try {
      for (let i = 0; i < parsedStudents.length; i++) {
        const student = parsedStudents[i];
        const { password, ...studentProfile } = student;

        await setDoc(doc(db, "students", student.id), cleanUndefined(studentProfile));
        await setDoc(doc(db, "accounts", student.id), { password: password || "password" });

        successCount++;
        setImportProgress(Math.round(((i + 1) / parsedStudents.length) * 100));
      }

      alert(`Successfully registered ${successCount} student accounts in Firestore!`);
      setIsImportModalOpen(false);
      setParsedStudents([]);
      setImportStatus(null);
    } catch (err: any) {
      console.error(err);
      alert("Error committing student import: " + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  const [isSyncingPasswords, setIsSyncingPasswords] = useState(false);

  const syncAllPasswordsToFatherNumber = () => {
    if (students.length === 0) {
      alert("No student records loaded yet.");
      return;
    }
    setConfirmDialog({
      isOpen: true,
      title: "Align Student Credentials",
      message: `Are you sure you want to reset and align ALL ${students.length} student login credentials to use their Father's Mobile Number as their password?`,
      confirmText: "Align Passwords",
      cancelText: "Cancel",
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        setIsSyncingPasswords(true);
        try {
          const batch = writeBatch(db);
          let count = 0;
          for (const s of students) {
            const passwordToSet = s.fatherNumber ? String(s.fatherNumber).trim() : "9876543210";
            batch.set(doc(db, "accounts", s.id), { password: passwordToSet });
            count++;
          }
          await batch.commit();
          alert(`Success! Instantly updated ${count} student passwords to their Father's Mobile Number in Firestore Database.`);
        } catch (err: any) {
          console.error("Error syncing passwords in bulk:", err);
          alert("Failed to sync student accounts: " + err.message);
        } finally {
          setIsSyncingPasswords(false);
        }
      }
    });
  };

  // Load all students and attendance records
  useEffect(() => {
    const unsubscribeStudents = onSnapshot(collection(db, "students"), (snapshot) => {
      const studentList: StudentProfile[] = [];
      snapshot.forEach((docSnap) => {
        studentList.push(docSnap.data() as StudentProfile);
      });
      setStudents(studentList);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "students");
    });

    const unsubscribeAttendance = onSnapshot(collection(db, "attendance"), (snapshot) => {
      const attendanceList: AttendanceRecord[] = [];
      snapshot.forEach((docSnap) => {
        attendanceList.push(docSnap.data() as AttendanceRecord);
      });
      setAttendance(attendanceList);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "attendance");
    });

    return () => {
      unsubscribeStudents();
      unsubscribeAttendance();
    };
  }, []);

  // Reset all filters
  const handleResetFilters = () => {
    setSelectedBranch("All");
    setSelectedSemester("All");
    setStartDate("");
    setEndDate("");
  };

  // 1. Get filtered students based on active dropdown filters
  const filteredStudentsForStats = students.filter((s) => {
    if (selectedBranch !== "All" && s.branch !== selectedBranch) return false;
    if (selectedSemester !== "All" && s.semester !== selectedSemester) return false;
    return true;
  });

  // 2. Get filtered attendance records based on active filters (including date range)
  const filteredAttendanceForStats = attendance.filter((a) => {
    // Filter by branch
    if (selectedBranch !== "All" && a.branch !== selectedBranch) return false;
    
    // Filter by semester (requires looking up corresponding student)
    if (selectedSemester !== "All") {
      const studentProfile = students.find((s) => s.id === a.studentId);
      if (!studentProfile || studentProfile.semester !== selectedSemester) return false;
    }

    // Filter by date range (YYYY-MM-DD comparison)
    if (startDate && a.date < startDate) return false;
    if (endDate && a.date > endDate) return false;

    return true;
  });

  // 3. Compute Branch / Semester Performance Metrics Dynamically
  const getDynamicBranchMetrics = (): (BranchStat & { label: string })[] => {
    const isSingleBranch = selectedBranch !== "All";
    
    // If a single branch is selected, we segment by semester. Otherwise, we segment by branch.
    const segments = isSingleBranch 
      ? ["Semester 1", "Semester 2", "Semester 3", "Semester 4", "Semester 5", "Semester 6", "Semester 7", "Semester 8"]
      : ["CSE", "ECE", "EEE", "IT", "MECH", "CIVIL", "CSD", "CSM-A", "CSM-B"];

    return segments.map((segment) => {
      const segmentStudents = students.filter((s) => {
        if (isSingleBranch) {
          return s.branch === selectedBranch && s.semester === segment;
        } else {
          return s.branch === segment && (selectedSemester === "All" || s.semester === selectedSemester);
        }
      });

      const studentCount = segmentStudents.length;

      // Compute Average Attendance
      let avgAttendance = 0;
      if (studentCount > 0) {
        const studentIds = segmentStudents.map((s) => s.id);
        const segmentAttendance = filteredAttendanceForStats.filter((a) => studentIds.includes(a.studentId));
        // Approximate standard: active clockins against a potential of 3 logs per student
        avgAttendance = segmentAttendance.length > 0 
          ? Math.min(100, Math.round((segmentAttendance.length / (studentCount * 3)) * 100)) 
          : 0;
      }

      // Compute Total Backlogs
      const totalBacklogs = segmentStudents.reduce((sum, s) => sum + (s.backlogs || 0), 0);

      // Compute Performance Index
      const avgPerformance = studentCount > 0 
        ? Math.max(30, 100 - (totalBacklogs / studentCount) * 10) 
        : 0;

      // Compute Fees Collection Rate
      const totalFeesDue = segmentStudents.reduce((sum, s) => sum + s.feesTotal, 0);
      const totalFeesPaid = segmentStudents.reduce((sum, s) => sum + s.feesPaid, 0);
      const feesCollectionRate = totalFeesDue > 0 ? Math.round((totalFeesPaid / totalFeesDue) * 100) : 0;

      return {
        branch: isSingleBranch ? selectedBranch : segment,
        label: segment,
        studentCount,
        avgAttendance,
        totalBacklogs,
        avgPerformance: Math.round(avgPerformance),
        feesCollectionRate,
      };
    });
  };

  const dynamicStats = getDynamicBranchMetrics();

  // 4. Calculate Overall Aggregates for Currently Filtered Cohort
  const totalStudentsCount = filteredStudentsForStats.length;
  const totalOutstandingFees = filteredStudentsForStats.reduce((sum, s) => sum + (s.feesRemaining || 0), 0);
  const totalClearStudents = filteredStudentsForStats.filter((s) => s.backlogs === 0).length;
  const globalAcademicStanding = totalStudentsCount > 0 ? Math.round((totalClearStudents / totalStudentsCount) * 100) : 0;
  const totalBacklogsCount = filteredStudentsForStats.reduce((sum, s) => sum + (s.backlogs || 0), 0);

  // 5. Calculate User Activity Metrics
  const activeCheckinsCount = filteredAttendanceForStats.length;
  
  // Average Match Confidence
  const avgVerificationConfidence = filteredAttendanceForStats.length > 0
    ? Math.round(filteredAttendanceForStats.reduce((sum, a) => sum + a.verificationConfidence, 0) / filteredAttendanceForStats.length)
    : 0;

  // GPS Bypassed Count / Ratio
  const bypassedCheckinsCount = filteredAttendanceForStats.filter((a) => a.gps?.bypassed).length;
  const gpsBypassRate = filteredAttendanceForStats.length > 0
    ? Math.round((bypassedCheckinsCount / filteredAttendanceForStats.length) * 100)
    : 0;

  // Peak Clock-In Hour Analysis
  const getPeakClockInHour = () => {
    if (filteredAttendanceForStats.length === 0) return "N/A";
    const hourCounts: { [key: number]: number } = {};
    filteredAttendanceForStats.forEach((a) => {
      const hour = new Date(a.timestamp).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    let peakHour = 9;
    let maxCount = 0;
    Object.keys(hourCounts).forEach((h) => {
      const hr = parseInt(h);
      if (hourCounts[hr] > maxCount) {
        maxCount = hourCounts[hr];
        peakHour = hr;
      }
    });
    const ampm = peakHour >= 12 ? "PM" : "AM";
    const displayHour = peakHour % 12 === 0 ? 12 : peakHour % 12;
    return `${displayHour}:00 ${ampm}`;
  };
  const peakClockInHour = getPeakClockInHour();

  // 6. Calculate Attendance Trend Line Over Time
  const getAttendanceTrends = () => {
    const dateCounts: { [key: string]: number } = {};
    filteredAttendanceForStats.forEach((a) => {
      dateCounts[a.date] = (dateCounts[a.date] || 0) + 1;
    });

    // Sort dates ascending
    const sortedDates = Object.keys(dateCounts).sort();
    
    if (sortedDates.length === 0) {
      // Return beautiful dummy placeholder line if no check-ins found
      return [
        { date: "Day 1", count: 0 },
        { date: "Day 2", count: 0 },
        { date: "Day 3", count: 0 }
      ];
    }

    return sortedDates.map((date) => ({
      date: new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      count: dateCounts[date]
    }));
  };
  const attendanceTrends = getAttendanceTrends();

  // 7. Executive Analytical Report Download (Multi-Section Excel-ready CSV)
  const downloadAnalyticalReport = () => {
    if (students.length === 0) {
      alert("No data available to compile report.");
      return;
    }

    const sections: string[] = [];

    // Title / Metadata Banner
    sections.push(`"CENTRAL COLLEGE SERVER - EXECUTIVE ANALYTICAL REPORT"`);
    sections.push(`"Generated At:","${new Date().toLocaleString()}"`);
    sections.push(`"Export Filters:"`);
    sections.push(`"Selected Branch:","${selectedBranch}","Selected Semester:","${selectedSemester}"`);
    sections.push(`"Date Range:","${startDate || "All Time"} to ${endDate || "All Time"}"`);
    sections.push("");

    // Section 1: Filtered Cohort Overall Aggregates
    sections.push(`"SECTION 1: OVERALL COHORT AGGREGATE SUMMARY"`);
    sections.push(`"Metric","Value"`);
    sections.push(`"Total Students Enrolled","${totalStudentsCount}"`);
    sections.push(`"Clear Standing Ratio (%)","${globalAcademicStanding}%"`);
    sections.push(`"Total Cumulative Backlogs","${totalBacklogsCount}"`);
    sections.push(`"Outstanding Fee Balance","INR ${totalOutstandingFees.toLocaleString()}"`);
    sections.push(`"Total Attendance Logs Recorded","${activeCheckinsCount}"`);
    sections.push(`"Avg Facial Recognition Confidence","${avgVerificationConfidence}%"`);
    sections.push(`"GPS Indoor Bypass Rate","${gpsBypassRate}%"`);
    sections.push(`"Peak Student Activity Hour","${peakClockInHour}"`);
    sections.push("");

    // Section 2: Segments breakdown (By Branch or By Semester)
    const segmentHeaderName = selectedBranch === "All" ? "Departmental Branch" : `Semesters of ${selectedBranch}`;
    sections.push(`"SECTION 2: COHORT SEGMENT BREAKDOWN - ${segmentHeaderName.toUpperCase()}"`);
    sections.push(`"Segment Label","Total Students","Avg Performance Index (out of 100)","Avg Attendance Rate (%)","Outstanding Backlogs","Fees Collection Rate (%)"`);
    dynamicStats.forEach((stat) => {
      sections.push(`"${stat.label}","${stat.studentCount}","${stat.avgPerformance}","${stat.avgAttendance}%","${stat.totalBacklogs}","${stat.feesCollectionRate}%"`);
    });
    sections.push("");

    // Section 3: Attendance Trend Timeline
    sections.push(`"SECTION 3: DAILY ATTENDANCE TIMELINE TRENDS"`);
    sections.push(`"Recorded Date","Successful Student Clock-Ins"`);
    attendanceTrends.forEach((trend) => {
      sections.push(`"${trend.date}","${trend.count}"`);
    });
    sections.push("");

    // Section 4: Individual Logs list for current filters
    sections.push(`"SECTION 4: DETAILED ATTENDANCE AUDIT LOGS"`);
    sections.push(`"Student ID","Student Name","Branch","Date","Timestamp","GPS Location Mode","Confidence Score"`);
    
    // Sort logs: most recent first
    const sortedAudits = [...filteredAttendanceForStats].sort((a, b) => b.timestamp - a.timestamp);
    sortedAudits.forEach((log) => {
      const timeStr = new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const gpsMode = log.gps?.bypassed ? "Indoor Override (Bypassed)" : `${log.gps?.latitude?.toFixed(6)}, ${log.gps?.longitude?.toFixed(6)}`;
      sections.push(`"${log.studentId}","${log.studentName}","${log.branch}","${log.date}","${timeStr}","${gpsMode}","${log.verificationConfidence}%"`);
    });

    const csvContent = sections.join("\n");
    const blob = new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    link.href = url;
    link.setAttribute("download", `Executive_Analytics_Report_${selectedBranch.replace(/\s+/g, "_")}_${new Date().toLocaleDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Original student registry CSV download
  const downloadUsersExcel = () => {
    if (students.length === 0) {
      alert("No student data available to download.");
      return;
    }

    const headers = [
      "VissionAttendID", "First Name", "Middle Name", "Last Name", "Mail ID", "Mobile", 
      "Branch", "Semester", "Backlogs", "Fees Total", "Fees Paid", 
      "Coordinator Faculty", "Father Name", "Father Mobile", "Mother Name", "Mother Mobile"
    ];

    const rows = students.map((s) => [
      s.id,
      s.firstName,
      s.middleName || "",
      s.lastName,
      s.email,
      s.mobile,
      s.branch,
      s.semester,
      s.backlogs,
      s.feesTotal,
      s.feesPaid,
      s.facultyName,
      s.fatherName,
      s.fatherNumber,
      s.motherName,
      s.motherNumber
    ]);

    const csvContent = [headers, ...rows].map((row) => row.map((val) => `"${val}"`).join(",")).join("\n");
    const blob = new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    link.href = url;
    link.setAttribute("download", `Student_Registry_Database_${new Date().toLocaleDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Delete User Account
  const handleDeleteUser = (studentId: string) => {
    setConfirmDialog({
      isOpen: true,
      title: "Delete Student Profile",
      message: `Are you sure you want to completely delete student account "${studentId}" and clear all associated registration and authentication files?`,
      confirmText: "Delete Account",
      cancelText: "Cancel",
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        setIsDeleting(studentId);
        try {
          await deleteDoc(doc(db, "students", studentId));
          await deleteDoc(doc(db, "accounts", studentId));
          alert("User account successfully deleted from university database.");
        } catch (err: any) {
          console.error(err);
          alert("Failed to delete student records: " + err.message);
        } finally {
          setIsDeleting(null);
        }
      }
    });
  };

  // Filter students for display directory search
  const filteredStudents = students.filter((s) => {
    if (!s) return false;
    const firstName = s.firstName || "";
    const lastName = s.lastName || "";
    const id = s.id || "";
    const branch = s.branch || "";
    const query = searchQuery || "";

    const name = `${firstName} ${lastName}`.toLowerCase();
    const matchesSearch = (
      name.includes(query.toLowerCase()) ||
      id.toLowerCase().includes(query.toLowerCase()) ||
      branch.toLowerCase().includes(query.toLowerCase())
    );

    // Apply active segment filters in directory table as well
    const matchesBranch = selectedBranch === "All" || s.branch === selectedBranch;
    const matchesSemester = selectedSemester === "All" || s.semester === selectedSemester;

    return matchesSearch && matchesBranch && matchesSemester;
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">

      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 rounded-[2rem] bg-white p-6 border border-slate-100 shadow-xl backdrop-blur-sm mb-8 text-slate-800">
        <div>
          <span className="rounded-full bg-red-50 px-3 py-1 text-[10px] font-bold text-red-600 uppercase tracking-widest border border-red-100">
            System Administrator
          </span>
          <h1 className="text-2xl font-black tracking-tight text-slate-800 mt-2">
            VisionAttend System Analytics
          </h1>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Realtime database analysis and academic performance dashboard
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={syncAllPasswordsToFatherNumber}
            disabled={isSyncingPasswords || students.length === 0}
            className="flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 hover:shadow-amber-100 shadow-lg shadow-amber-100 px-4 py-3.5 text-xs font-bold text-white transition active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <Lock className="h-4 w-4" /> 
            {isSyncingPasswords ? "Syncing..." : "Sync Passwords to Father No."}
          </button>
          <button
            type="button"
            onClick={seedExcelStudents}
            disabled={isSeedingExcel}
            className="flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 hover:shadow-violet-100 shadow-lg shadow-violet-100 px-4 py-3.5 text-xs font-bold text-white transition active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <Database className="h-4 w-4" /> 
            {isSeedingExcel ? `Seeding (${seedProgress}%)` : "Seed Excel Students"}
          </button>
          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 hover:shadow-emerald-100 shadow-lg shadow-emerald-100 px-4 py-3.5 text-xs font-bold text-white transition active:scale-95 cursor-pointer animate-pulse"
          >
            <Upload className="h-4 w-4" /> Bulk Excel Import
          </button>
          <button
            type="button"
            onClick={downloadAnalyticalReport}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-100 shadow-lg shadow-indigo-100 px-4 py-3.5 text-xs font-bold text-white transition active:scale-95 cursor-pointer"
          >
            <FileSpreadsheet className="h-4 w-4" /> Download Analytics Report (Excel/CSV)
          </button>
          <button
            type="button"
            onClick={downloadUsersExcel}
            className="flex items-center gap-2 rounded-xl bg-slate-50 hover:bg-slate-100 hover:text-slate-800 px-4 py-3.5 text-xs font-bold text-slate-650 border border-slate-200 transition active:scale-95 cursor-pointer"
          >
            <Download className="h-4 w-4" /> Export Student Registry
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-2 rounded-xl bg-slate-50 hover:bg-slate-100 hover:text-red-600 px-4 py-3.5 text-xs font-bold text-slate-650 border border-slate-200 transition active:scale-95 cursor-pointer"
          >
            <LogOut className="h-4 w-4" /> Exit Console
          </button>
        </div>
      </div>

      {/* Advanced Filter Management Panel */}
      <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-xl mb-8 text-slate-800">
        <div className="flex items-center gap-2 mb-4 border-b border-slate-150 pb-3">
          <Filter className="h-4.5 w-4.5 text-indigo-600" />
          <h2 className="text-sm font-black text-slate-800 tracking-tight uppercase">
            Insight Filter Controls
          </h2>
          <span className="ml-auto rounded-full bg-slate-100 px-2.5 py-0.5 text-[9px] font-black text-slate-500 font-mono">
            COHORT: {totalStudentsCount} / {students.length}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Branch Filter */}
          <div>
            <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
              Branch Department
            </label>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-600"
            >
              <option value="All">All Department Branches</option>
              <option value="CSE">CSE - Computer Science</option>
              <option value="ECE">ECE - Electronics & Comm</option>
              <option value="EEE">EEE - Electrical & Electronics</option>
              <option value="IT">IT - Information Technology</option>
              <option value="MECH">MECH - Mechanical Engineering</option>
              <option value="CIVIL">CIVIL - Civil Engineering</option>
              <option value="CSD">CSD - Computer Science (Data Science)</option>
              <option value="CSM-A">CSM-A - Computer Science (AIML A)</option>
              <option value="CSM-B">CSM-B - Computer Science (AIML B)</option>
            </select>
          </div>

          {/* Semester Filter */}
          <div>
            <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
              Active Semester
            </label>
            <select
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(e.target.value)}
              className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-600"
            >
              <option value="All">All Semesters (1-8)</option>
              <option value="Semester 1">Semester 1</option>
              <option value="Semester 2">Semester 2</option>
              <option value="Semester 3">Semester 3</option>
              <option value="Semester 4">Semester 4</option>
              <option value="Semester 5">Semester 5</option>
              <option value="Semester 6">Semester 6</option>
              <option value="Semester 7">Semester 7</option>
              <option value="Semester 8">Semester 8</option>
            </select>
          </div>

          {/* Start Date filter */}
          <div>
            <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
              Start Date
            </label>
            <div className="relative">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
          </div>

          {/* End Date filter */}
          <div>
            <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
              End Date
            </label>
            <div className="relative">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
          </div>
        </div>

        {/* Clear filter button */}
        {(selectedBranch !== "All" || selectedSemester !== "All" || startDate || endDate) && (
          <div className="flex justify-end mt-4">
            <button
              type="button"
              onClick={handleResetFilters}
              className="flex items-center gap-1.5 text-xs font-bold text-red-600 hover:text-red-700 transition cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Reset Analytical Filters
            </button>
          </div>
        )}
      </div>

      {/* Aggregate Cards for Filtered Cohort */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-lg flex items-center gap-4">
          <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cohort Count</p>
            <p className="text-xl font-black text-slate-800">{totalStudentsCount}</p>
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-lg flex items-center gap-4">
          <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600">
            <CheckCircle className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Clear Stand Ratio</p>
            <p className="text-xl font-black text-slate-800">{globalAcademicStanding}%</p>
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-lg flex items-center gap-4">
          <div className="rounded-xl bg-red-50 p-3 text-red-600">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cohort Backlogs</p>
            <p className="text-xl font-black text-slate-800">{totalBacklogsCount}</p>
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-lg flex items-center gap-4">
          <div className="rounded-xl bg-amber-50 p-3 text-amber-600">
            <CreditCard className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cohort Unpaid</p>
            <p className="text-xl font-black text-slate-800">₹{totalOutstandingFees.toLocaleString("en-IN")}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        {/* Branch / Semester Performance Charts */}
        <div className="lg:col-span-2 rounded-[2rem] border border-slate-100 bg-white p-6 shadow-xl text-slate-800">
          <h2 className="text-md font-bold text-slate-800 mb-6 flex items-center gap-2">
            <BarChart className="h-5 w-5 text-indigo-600" />
            {selectedBranch === "All" 
              ? "Branch Performance Comparison" 
              : `Academic Standing of ${selectedBranch} Semesters`
            }
          </h2>

          <div className="space-y-6">
            {dynamicStats.map((stat, idx) => (
              <div key={`${stat.label || "segment"}-${idx}`} className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-extrabold text-slate-850">{stat.label} Segment</span>
                  <span className="text-slate-400 font-medium font-mono">
                    {stat.studentCount} profiles • Performance Index: <span className="font-bold text-indigo-600">{stat.avgPerformance}/100</span>
                  </span>
                </div>
                {/* Custom Responsive SVG Progress bar with double gradients */}
                <div className="relative h-3.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                  <motion.div
                    className="absolute h-full rounded-full bg-gradient-to-r from-indigo-600 to-indigo-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${stat.avgPerformance}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 font-semibold font-mono">
                  <span>Avg Attendance: <span className="text-slate-750 font-bold">{stat.avgAttendance}%</span></span>
                  <span>Fees Coll Rate: <span className="text-slate-750 font-bold">{stat.feesCollectionRate}%</span></span>
                  <span>Active Backlogs: <span className={`font-bold ${stat.totalBacklogs > 0 ? "text-red-600" : "text-slate-400"}`}>{stat.totalBacklogs}</span></span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* User Activity & Biometrics Metrics block */}
        <div className="lg:col-span-1 rounded-[2rem] border border-slate-100 bg-white p-6 shadow-xl text-slate-800 flex flex-col justify-between">
          <div>
            <h2 className="text-md font-bold text-slate-800 mb-4 flex items-center gap-2 border-b border-slate-100 pb-3.5">
              <Activity className="h-5 w-5 text-indigo-600" /> Biometrics & Activity
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed font-semibold mb-6">
              Evaluation metrics from the facial recognition check-in system, indoor overrides, and peak server hours.
            </p>
          </div>

          <div className="space-y-5">
            {/* Metric 1: Avg Match Confidence */}
            <div className="rounded-xl bg-indigo-50/50 border border-indigo-100/60 p-3.5">
              <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> Avg Facial Match Conf
              </p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-indigo-600">{avgVerificationConfidence}%</span>
                <span className="text-[10px] font-bold text-slate-400">match index</span>
              </div>
            </div>

            {/* Metric 2: GPS Indoor Bypass Rate */}
            <div className="rounded-xl bg-amber-50/50 border border-amber-100/60 p-3.5">
              <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest flex items-center gap-1">
                <MapPinOff className="h-3 w-3" /> GPS Indoor Bypass Rate
              </p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-amber-700">{gpsBypassRate}%</span>
                <span className="text-[10px] font-bold text-slate-400">
                  {bypassedCheckinsCount} of {activeCheckinsCount} logs
                </span>
              </div>
            </div>

            {/* Metric 3: Peak Attendance Hour */}
            <div className="rounded-xl bg-emerald-50/50 border border-emerald-100/60 p-3.5">
              <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest flex items-center gap-1">
                <Clock className="h-3 w-3" /> Peak Clock-In Hour
              </p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-emerald-700">{peakClockInHour}</span>
                <span className="text-[10px] font-bold text-slate-400">daily maximum load</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Attendance trends timeline chart */}
      <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-xl text-slate-800 mb-8">
        <h2 className="text-md font-bold text-slate-800 mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-indigo-600 animate-pulse" /> Overall Attendance Trends Timeline
        </h2>
        <p className="text-xs text-slate-500 font-semibold mb-6">
          Daily aggregate timeline showing successful face-verified student clock-ins for the selected date range.
        </p>

        {filteredAttendanceForStats.length === 0 ? (
          <div className="text-center py-10 text-slate-400 border border-dashed border-slate-200 rounded-xl">
            <CalendarRange className="mx-auto mb-2 h-8 w-8 opacity-30" />
            <p className="text-xs font-semibold">No attendance log data matching the selected date ranges.</p>
          </div>
        ) : (
          <div className="w-full">
            {/* Elegant Responsive SVG Area Chart representation */}
            <div className="h-64 w-full bg-slate-50 border border-slate-200/60 rounded-2xl p-4 flex flex-col justify-between">
              <div className="flex-1 flex items-end justify-between gap-2 px-4 pt-4">
                {attendanceTrends.map((trend, idx) => {
                  const maxCount = Math.max(...attendanceTrends.map((t) => t.count), 1);
                  const heightPercent = Math.max(10, Math.round((trend.count / maxCount) * 85));
                  
                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center group relative">
                      {/* Tooltip on hover */}
                      <div className="absolute -top-10 scale-0 group-hover:scale-100 transition-all bg-slate-900 text-white rounded-lg px-2.5 py-1 text-[10px] font-mono font-bold whitespace-nowrap z-10 shadow-md">
                        {trend.count} clock-ins
                      </div>
                      
                      {/* Animated Area bar with gradient effect */}
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${heightPercent}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className="w-full max-w-[24px] bg-gradient-to-t from-indigo-600 to-indigo-400 rounded-t-md hover:from-indigo-500 hover:to-indigo-300 transition-colors shadow-sm"
                      />
                      <span className="text-[9px] font-bold text-slate-400 truncate w-full text-center mt-2.5 font-mono">
                        {trend.date}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* User Accounts Management Database table */}
      <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-xl text-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-md font-bold text-slate-800">Filtered Directory Registry</h2>
            <p className="text-xs text-slate-500">Database audit, account deletions, and enrollment status check matching filters</p>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <button
              type="button"
              onClick={() => openCrudModal("create")}
              className="flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 text-xs font-bold transition active:scale-95 cursor-pointer whitespace-nowrap shadow-md shadow-indigo-100"
            >
              <Plus className="h-4 w-4" /> Add Student
            </button>

            <div className="relative w-full md:w-64">
              <Search className="absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search user record..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl bg-slate-50 border border-slate-200 px-10 py-2.5 text-xs font-semibold text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
          </div>
        </div>

        {filteredStudents.length === 0 ? (
          <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-xl">
            <Database className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm font-semibold">No student database accounts matching active filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 text-xs font-extrabold uppercase tracking-wider">
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">VissionAttendID</th>
                  <th className="py-3 px-4">Branch</th>
                  <th className="py-3 px-4">Active Backlogs</th>
                  <th className="py-3 px-4">Coordinator</th>
                  <th className="py-3 px-4 text-right">Tuition</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((s, idx) => (
                  <tr key={`${s.id || "student"}-${idx}`} className="border-b border-slate-100/60 text-slate-700">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <img 
                          src={s.photoUrl} 
                          alt={s.firstName} 
                          className="h-9 w-9 rounded-lg object-cover border border-slate-200"
                        />
                        <div>
                          <p className="font-extrabold text-slate-800 text-xs">{s.firstName} {s.lastName}</p>
                          <p className="text-[10px] text-slate-400">{s.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-xs text-indigo-600">{s.id}</td>
                    <td className="py-3.5 px-4 text-xs font-bold">{s.branch} ({s.semester})</td>
                    <td className="py-3.5 px-4 text-xs">
                      <span className={`inline-block px-2 py-0.5 rounded-full font-bold border ${s.backlogs > 0 ? "bg-red-50 text-red-600 border-red-100" : "bg-emerald-50 text-emerald-700 border-emerald-100"}`}>
                        {s.backlogs} {s.backlogs === 0 ? "Clear" : "Backlogs"}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs font-bold text-slate-500">{s.facultyName}</td>
                    <td className="py-3.5 px-4 text-right text-xs">
                      <p className="font-bold text-slate-800 font-mono">₹{(s.feesRemaining || 0).toLocaleString()}</p>
                      <span className={`text-[9px] font-black uppercase ${s.feesStatus === "Paid" ? "text-emerald-600" : "text-amber-600"}`}>
                        {s.feesStatus || "Pending"}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openCrudModal("view", s)}
                          className="rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 p-2 transition shrink-0 active:scale-95 cursor-pointer"
                          title="View student profile"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openCrudModal("edit", s)}
                          className="rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-100 p-2 transition shrink-0 active:scale-95 cursor-pointer"
                          title="Edit student profile"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(s.id)}
                          disabled={isDeleting === s.id}
                          className="rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 p-2 transition shrink-0 active:scale-95 disabled:opacity-50 cursor-pointer"
                          title="Delete student account"
                        >
                          {isDeleting === s.id ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Student CRUD Modal */}
      <AnimatePresence>
        {isCrudModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-2xl rounded-[2.5rem] border border-slate-100 bg-white p-6 shadow-2xl md:p-8 max-h-[90vh] overflow-y-auto text-slate-800"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                <div>
                  <h3 className="text-lg font-black tracking-tight text-slate-900 uppercase">
                    {crudMode === "create" ? "Enroll New Student" : crudMode === "edit" ? "Edit Student Profile" : "Student Detailed Profile"}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-1">
                    {crudMode === "create" ? "Add details below to instantiate a new student and parent login record." : crudMode === "edit" ? "Modify registration properties for this enrollment in the cloud database." : "University registrar verified profile details and credentials verification."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCrudModalOpen(false)}
                  className="rounded-full bg-slate-50 hover:bg-slate-100 p-2 text-slate-400 hover:text-slate-600 transition cursor-pointer border border-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {crudMode === "view" && selectedStudentForCrud ? (
                /* View Mode */
                <div className="space-y-6">
                  {/* Avatar Row */}
                  <div className="flex flex-col sm:flex-row items-center gap-5 bg-slate-50 p-5 rounded-[2rem] border border-slate-100">
                    <img
                      src={selectedStudentForCrud.photoUrl}
                      alt={selectedStudentForCrud.firstName}
                      className="h-20 w-20 rounded-2xl object-cover border border-slate-200 shadow-md bg-white"
                    />
                    <div className="text-center sm:text-left">
                      <h4 className="text-lg font-black text-slate-900">
                        {selectedStudentForCrud.firstName} {selectedStudentForCrud.lastName}
                      </h4>
                      <p className="text-xs font-mono font-bold text-indigo-600 uppercase mt-0.5 tracking-wider bg-indigo-50/50 px-2.5 py-1 rounded-full border border-indigo-100/60 inline-block">
                        Roll No: {selectedStudentForCrud.id}
                      </p>
                      <p className="text-xs text-slate-500 font-bold mt-1.5">
                        {selectedStudentForCrud.branch} Department &bull; {selectedStudentForCrud.semester}
                      </p>
                    </div>
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-xs">
                    {/* Academic Info Card */}
                    <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3.5 shadow-sm">
                      <h5 className="font-extrabold uppercase tracking-wider text-slate-400 text-[10px]">Academic Records</h5>
                      <div className="space-y-2">
                        <div className="flex justify-between border-b border-slate-50 pb-1.5">
                          <span className="text-slate-450 font-medium">In-Charge Coordinator</span>
                          <span className="font-bold text-slate-800">{selectedStudentForCrud.facultyName}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-50 pb-1.5">
                          <span className="text-slate-450 font-medium">Active Backlogs</span>
                          <span className={`px-2 py-0.5 rounded-full font-bold border ${selectedStudentForCrud.backlogs > 0 ? "bg-red-50 text-red-600 border-red-100" : "bg-emerald-50 text-emerald-700 border-emerald-100"}`}>
                            {selectedStudentForCrud.backlogs}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-450 font-medium">Date of Birth</span>
                          <span className="font-bold text-slate-700 font-mono">{selectedStudentForCrud.dob || "N/A"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Personal & Contact Info Card */}
                    <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3.5 shadow-sm">
                      <h5 className="font-extrabold uppercase tracking-wider text-slate-400 text-[10px]">Personal & Contact Details</h5>
                      <div className="space-y-2">
                        <div className="flex justify-between border-b border-slate-50 pb-1.5">
                          <span className="text-slate-450 font-medium">Email Address</span>
                          <span className="font-bold text-slate-700 font-mono select-all truncate max-w-[160px]">{selectedStudentForCrud.email}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-50 pb-1.5">
                          <span className="text-slate-450 font-medium">Mobile Number</span>
                          <span className="font-bold text-slate-700 font-mono">{selectedStudentForCrud.mobile || "N/A"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-450 font-medium">Gender</span>
                          <span className="font-bold text-slate-700 capitalize">{selectedStudentForCrud.gender || "Not specified"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Family Contacts Card */}
                    <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3.5 shadow-sm sm:col-span-2">
                      <h5 className="font-extrabold uppercase tracking-wider text-slate-400 text-[10px]">Family Contacts Information</h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <div className="flex justify-between border-b border-slate-50 pb-1.5">
                            <span className="text-slate-450 font-medium">Father's Name</span>
                            <span className="font-bold text-slate-700">{selectedStudentForCrud.fatherName || "N/A"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-450 font-medium">Father's Mobile No.</span>
                            <span className="font-bold text-slate-700 font-mono">{selectedStudentForCrud.fatherNumber || "N/A"}</span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between border-b border-slate-50 pb-1.5">
                            <span className="text-slate-450 font-medium">Mother's Name</span>
                            <span className="font-bold text-slate-700">{selectedStudentForCrud.motherName || "N/A"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-450 font-medium">Mother's Mobile No.</span>
                            <span className="font-bold text-slate-700 font-mono">{selectedStudentForCrud.motherNumber || "N/A"}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Financial Status Card */}
                    <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 space-y-3.5 sm:col-span-2">
                      <h5 className="font-extrabold uppercase tracking-wider text-slate-400 text-[10px]">Financial Tuition Standing</h5>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                          <span className="block text-[9px] font-extrabold text-slate-400 uppercase">Total Fees</span>
                          <span className="text-xs font-black text-slate-800 font-mono">₹{(selectedStudentForCrud.feesTotal || 0).toLocaleString()}</span>
                        </div>
                        <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                          <span className="block text-[9px] font-extrabold text-slate-400 uppercase">Paid amount</span>
                          <span className="text-xs font-black text-emerald-600 font-mono">₹{(selectedStudentForCrud.feesPaid || 0).toLocaleString()}</span>
                        </div>
                        <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                          <span className="block text-[9px] font-extrabold text-slate-400 uppercase">Remaining balance</span>
                          <span className={`text-xs font-black font-mono ${selectedStudentForCrud.feesRemaining > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                            ₹{(selectedStudentForCrud.feesRemaining || 0).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 mt-6">
                    <button
                      type="button"
                      onClick={() => openCrudModal("edit", selectedStudentForCrud)}
                      className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 text-xs font-bold transition active:scale-95 cursor-pointer shadow-md shadow-indigo-100"
                    >
                      Edit Profile Properties
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsCrudModalOpen(false)}
                      className="rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 px-4 py-2.5 text-xs font-bold transition active:scale-95 cursor-pointer"
                    >
                      Close Details
                    </button>
                  </div>
                </div>
              ) : (
                /* Create & Edit Forms */
                <form onSubmit={handleSaveStudent} className="space-y-5 text-xs">
                  {/* Photo Section */}
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4">
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      <img
                        src={formPhotoUrl || "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="}
                        alt="Student Portrait"
                        className="h-20 w-20 rounded-xl object-cover border border-slate-200 bg-white shadow-sm shrink-0"
                      />
                      <div className="space-y-1.5 flex-1 text-center sm:text-left">
                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Live Biometric Reference Photo</h4>
                        <p className="text-[10px] text-slate-500 font-semibold">Change the official photo record for facial recognition check-in. Choose to upload an existing file or capture a secure live webcam selfie with GPS telemetry.</p>
                        
                        {formOriginalGps && (
                          <div className="flex items-center justify-center sm:justify-start gap-1.5 mt-1 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg text-[9px] font-extrabold border border-emerald-100 self-start">
                            <MapPin className="h-3 w-3 text-emerald-600 animate-pulse" />
                            GPS Telemetry Locked: {formOriginalGps.latitude.toFixed(5)}, {formOriginalGps.longitude.toFixed(5)}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                          {/* Option 1: File upload */}
                          <label className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-800 border border-indigo-100 font-bold px-3 py-1.5 rounded-lg text-[10px] transition cursor-pointer select-none">
                            <Upload className="h-3 w-3" /> Upload Portrait
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onloadend = async () => {
                                    const base64 = reader.result as string;
                                    try {
                                      const compressed = await compressImage(base64);
                                      setFormPhotoUrl(compressed);
                                    } catch (err) {
                                      console.error("Compression failed, using original base64", err);
                                      setFormPhotoUrl(base64);
                                    }
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                          </label>

                          {/* Option 2: Live GPS camera capture */}
                          <button
                            type="button"
                            onClick={() => setShowWebcam(!showWebcam)}
                            className={`flex items-center gap-1.5 font-bold px-3 py-1.5 rounded-lg text-[10px] transition cursor-pointer select-none border ${
                              showWebcam
                                ? "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                                : "bg-indigo-50 border-indigo-100 text-indigo-700 hover:bg-indigo-100"
                            }`}
                          >
                            <Camera className="h-3 w-3" /> {showWebcam ? "Close Camera View" : "Capture with GPS Webcam"}
                          </button>

                          {/* Option 3: Reset to student's live photo on record */}
                          {formOriginalLiveImage && formPhotoUrl !== formOriginalLiveImage && (
                            <button
                              type="button"
                              onClick={() => {
                                setFormPhotoUrl(formOriginalLiveImage);
                              }}
                              className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 hover:text-emerald-850 border border-emerald-100 font-bold px-3 py-1.5 rounded-lg text-[10px] transition cursor-pointer"
                              title="Reset to the original biometric live-camera photo captured by the student"
                            >
                              <RefreshCw className="h-3 w-3 text-emerald-600" /> Reset to Live Photo
                            </button>
                          )}

                          {/* Option 4: Clear to blank placeholder */}
                          {formPhotoUrl && formPhotoUrl !== "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" && (
                            <button
                              type="button"
                              onClick={() => {
                                setFormPhotoUrl("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=");
                              }}
                              className="text-red-600 hover:text-red-700 font-bold hover:bg-red-50 border border-transparent hover:border-red-100 px-2.5 py-1.5 rounded-lg text-[10px] transition cursor-pointer"
                            >
                              Reset to Blank Canvas
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Camera view expandable element */}
                    {showWebcam && (
                      <div className="bg-slate-900 rounded-2xl p-4 border border-slate-800 text-white">
                        <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
                          <div>
                            <h5 className="text-[11px] font-black tracking-widest text-indigo-400 uppercase">Secure Webcam Enrollment Stage</h5>
                            <p className="text-[9px] text-slate-400 font-semibold leading-tight mt-0.5">Locks facial signature and geolocation coordinates directly on university files.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowWebcam(false)}
                            className="text-slate-400 hover:text-white transition p-1 cursor-pointer"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <CameraView
                          buttonLabel="Enroll Reference Photo"
                          onCapture={async (base64, gps) => {
                            try {
                              const compressed = await compressImage(base64);
                              setFormPhotoUrl(compressed);
                              setFormOriginalLiveImage(compressed);
                              setFormOriginalGps({
                                latitude: gps.latitude,
                                longitude: gps.longitude,
                                timestamp: Date.now(),
                                bypassed: gps.bypassed
                              });
                            } catch (err) {
                              console.error("Compression failed", err);
                              setFormPhotoUrl(base64);
                              setFormOriginalLiveImage(base64);
                              setFormOriginalGps({
                                latitude: gps.latitude,
                                longitude: gps.longitude,
                                timestamp: Date.now(),
                                bypassed: gps.bypassed
                              });
                            }
                            setShowWebcam(false);
                          }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* App ID/Roll Number */}
                    <div>
                      <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
                        Student VissionAttendID / Roll No *
                      </label>
                      <input
                        type="text"
                        required
                        disabled={crudMode === "edit"}
                        placeholder="e.g., STU10 or Roll No"
                        value={formId}
                        onChange={(e) => setFormId(e.target.value)}
                        className={`w-full rounded-xl border px-3.5 py-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-600 ${crudMode === "edit" ? "bg-slate-100 cursor-not-allowed border-slate-200" : "bg-slate-50 border-slate-200"}`}
                      />
                    </div>

                    {/* Email */}
                    <div>
                      <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
                        University Email Address
                      </label>
                      <input
                        type="email"
                        placeholder="e.g., rollno@aietta.ac.in"
                        value={formEmail}
                        onChange={(e) => setFormEmail(e.target.value)}
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                    </div>

                    {/* First Name */}
                    <div>
                      <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
                        First Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Enter first name"
                        value={formFirstName}
                        onChange={(e) => setFormFirstName(e.target.value)}
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                    </div>

                    {/* Last Name */}
                    <div>
                      <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
                        Last Name
                      </label>
                      <input
                        type="text"
                        placeholder="Enter last name"
                        value={formLastName}
                        onChange={(e) => setFormLastName(e.target.value)}
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                    </div>

                    {/* Branch */}
                    <div>
                      <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
                        Branch / Department *
                      </label>
                      <select
                        value={formBranch}
                        onChange={(e) => setFormBranch(e.target.value)}
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      >
                        <option value="CSE">CSE - Computer Science</option>
                        <option value="ECE">ECE - Electronics & Comm</option>
                        <option value="EEE">EEE - Electrical & Electronics</option>
                        <option value="IT">IT - Information Technology</option>
                        <option value="MECH">MECH - Mechanical Engineering</option>
                        <option value="CIVIL">CIVIL - Civil Engineering</option>
                        <option value="CSD">CSD - Computer Science (Data Science)</option>
                        <option value="CSM-A">CSM-A - Computer Science (AIML A)</option>
                        <option value="CSM-B">CSM-B - Computer Science (AIML B)</option>
                      </select>
                    </div>

                    {/* Semester */}
                    <div>
                      <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
                        Active Semester *
                      </label>
                      <select
                        value={formSemester}
                        onChange={(e) => setFormSemester(e.target.value)}
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      >
                        <option value="Semester 1">Semester 1</option>
                        <option value="Semester 2">Semester 2</option>
                        <option value="Semester 3">Semester 3</option>
                        <option value="Semester 4">Semester 4</option>
                        <option value="Semester 5">Semester 5</option>
                        <option value="Semester 6">Semester 6</option>
                        <option value="Semester 7">Semester 7</option>
                        <option value="Semester 8">Semester 8</option>
                      </select>
                    </div>

                    {/* Date of Birth */}
                    <div>
                      <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
                        Date of Birth (YYYY-MM-DD)
                      </label>
                      <input
                        type="date"
                        value={formDob}
                        onChange={(e) => setFormDob(e.target.value)}
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                    </div>

                    {/* Gender */}
                    <div>
                      <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
                        Gender
                      </label>
                      <select
                        value={formGender}
                        onChange={(e) => setFormGender(e.target.value as "male" | "female" | "")}
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      >
                        <option value="">Select Gender</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                      </select>
                    </div>

                    {/* Mobile */}
                    <div>
                      <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
                        Mobile Number
                      </label>
                      <input
                        type="text"
                        placeholder="Enter 10-digit mobile number"
                        value={formMobile}
                        onChange={(e) => setFormMobile(e.target.value)}
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                    </div>

                    {/* Active Backlogs */}
                    <div>
                      <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
                        Active Backlogs
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={formBacklogs}
                        onChange={(e) => setFormBacklogs(Number(e.target.value))}
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                    </div>

                    {/* Password */}
                    <div>
                      <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
                        {crudMode === "create" ? "Student Portal Password *" : "Reset Password (leave blank to keep unchanged)"}
                      </label>
                      <input
                        type="text"
                        placeholder={crudMode === "create" ? "Default is Father's mobile" : "Enter new password if changing"}
                        value={formPassword}
                        onChange={(e) => setFormPassword(e.target.value)}
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                    </div>
                  </div>

                  {/* Family Details Header */}
                  <div className="border-t border-slate-100 pt-3 mt-4">
                    <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-3 font-semibold text-indigo-600">Family & Guardian Properties</h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Father Name */}
                    <div>
                      <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
                        Father's Name
                      </label>
                      <input
                        type="text"
                        placeholder="Enter father's name"
                        value={formFatherName}
                        onChange={(e) => setFormFatherName(e.target.value)}
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                    </div>

                    {/* Father number */}
                    <div>
                      <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
                        Father's Mobile Number
                      </label>
                      <input
                        type="text"
                        placeholder="Used as default login password"
                        value={formFatherNumber}
                        onChange={(e) => setFormFatherNumber(e.target.value)}
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                    </div>

                    {/* Mother Name */}
                    <div>
                      <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
                        Mother's Name
                      </label>
                      <input
                        type="text"
                        placeholder="Enter mother's name"
                        value={formMotherName}
                        onChange={(e) => setFormMotherName(e.target.value)}
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                    </div>

                    {/* Mother number */}
                    <div>
                      <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
                        Mother's Mobile Number
                      </label>
                      <input
                        type="text"
                        placeholder="Enter mother's mobile number"
                        value={formMotherNumber}
                        onChange={(e) => setFormMotherNumber(e.target.value)}
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                    </div>
                  </div>

                  {/* Financial Details Header */}
                  <div className="border-t border-slate-100 pt-3 mt-4">
                    <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-3 font-semibold text-indigo-600">Tuition Fee Ledger Properties</h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Fees Total */}
                    <div>
                      <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
                        Total Semester Tuition Fee (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="e.g., 140000"
                        value={formFeesTotal}
                        onChange={(e) => setFormFeesTotal(Number(e.target.value))}
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                    </div>

                    {/* Fees Paid */}
                    <div>
                      <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
                        Fees Paid to Date (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="e.g., 80000"
                        value={formFeesPaid}
                        onChange={(e) => setFormFeesPaid(Number(e.target.value))}
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 mt-6">
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 text-xs font-bold transition active:scale-95 cursor-pointer disabled:opacity-50 shadow-md shadow-indigo-100"
                    >
                      {isSaving ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" /> Saving...
                        </>
                      ) : (
                        "Save Student Profile"
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => setIsCrudModalOpen(false)}
                      className="rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 px-4 py-2.5 text-xs font-bold transition active:scale-95 cursor-pointer disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Confirmation Dialog Modal */}
      <AnimatePresence>
        {confirmDialog.isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md rounded-[2rem] border border-slate-100 bg-white p-6 shadow-2xl text-slate-800"
            >
              <div className="flex items-start gap-4">
                <div className={`rounded-full p-3 border shrink-0 ${
                  confirmDialog.title.toLowerCase().includes("delete")
                    ? "bg-red-50 text-red-600 border-red-100"
                    : "bg-amber-50 text-amber-600 border-amber-100"
                }`}>
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div className="space-y-1.5 flex-1">
                  <h3 className="text-sm font-black tracking-tight text-slate-900 uppercase">
                    {confirmDialog.title}
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                    {confirmDialog.message}
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 mt-6">
                <button
                  type="button"
                  onClick={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
                  className="rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 px-4 py-2.5 text-xs font-bold transition active:scale-95 cursor-pointer"
                >
                  {confirmDialog.cancelText || "Cancel"}
                </button>
                <button
                  type="button"
                  onClick={confirmDialog.onConfirm}
                  className={`rounded-xl px-5 py-2.5 text-xs font-bold transition active:scale-95 cursor-pointer shadow-md ${
                    confirmDialog.title.toLowerCase().includes("delete")
                      ? "bg-red-600 hover:bg-red-700 text-white shadow-red-100"
                      : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-100"
                  }`}
                >
                  {confirmDialog.confirmText || "Confirm"}
                </button>
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
