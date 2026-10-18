/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface StudentProfile {
  id: string; // App ID chosen by student
  firstName: string;
  middleName?: string;
  lastName: string;
  dob: string; // YYYY-MM-DD
  email: string;
  mobile: string;
  branch: string;
  semester: string; // e.g. "Semester 5"
  backlogs: number;
  feesTotal: number;
  feesPaid: number;
  feesRemaining: number;
  feesStatus: "Paid" | "Pending" | "Overdue";
  photoUrl: string; // Reference photo (base64 string)
  signupGps?: {
    latitude: number;
    longitude: number;
    timestamp: number;
  };
  facultyName: string; // Name of faculty incharge
  motherName: string;
  fatherName: string;
  motherNumber: string;
  fatherNumber: string;
  gender?: "male" | "female" | ""; // Gender field: "male" or "female"
  originalLiveImage?: string; // Captured webcam live image
  originalGps?: {
    latitude: number;
    longitude: number;
    timestamp?: number;
  };
  signatureUrl?: string; // Base64 signature image
  createdAt: number;
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  studentName: string; // Combined first + last
  branch: string;
  date: string; // YYYY-MM-DD
  timestamp: number;
  status: "Present" | "Absent";
  gps: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    bypassed?: boolean;
  };
  verificationConfidence: number; // Percentage from Gemini matching
  selfieBase64: string; // Captured attendance selfie
  livenessPassed?: boolean;
  livenessChallenge?: string;
  livenessDetails?: string;
}

export interface FacultyProfile {
  id: string;
  name: string;
  branch: string;
}

export interface BranchStat {
  branch: string;
  studentCount: number;
  avgAttendance: number; // percentage
  totalBacklogs: number;
  avgPerformance: number; // score out of 100 based on backlogs & attendance
  feesCollectionRate: number; // percentage of fees paid
}
