MyScheduler

A meeting scheduling web application with separate visitor and owner portals. Visitors can request meetings by picking a date and time slot, and the owner can approve, reject, reschedule, or cancel requests through a dedicated dashboard — with email confirmations sent automatically.

Features

Visitor Portal


Simple booking form: name, email, meeting title, meeting description, date, start time, end time
Live view of available slots and booked slots
Meeting status updates automatically after the owner responds (approved / rejected / rescheduled / cancelled)
Built-in AI assistant to answer common scheduling questions (available slots, how to book, rescheduling, cancellation policy)


Owner Dashboard (passcode-protected)


Overview cards: total requests, pending requests, approved, rejected, cancelled, and completed meetings
Full meeting requests table with search and status filtering
Actions per meeting: Approve, Reject, Reschedule, Cancel, Mark as Completed, View
Slot management: add, edit, block, delete, and reopen time slots
Reschedule tool to suggest a new date/time to a visitor with an optional reason
Recent activity feed
AI assistant for the owner (e.g. "which meetings need attention", "show today's schedule")


Tech Stack


Frontend: built with Antigravity (AI-assisted development)
Backend: Firebase (Authentication, Firestore/Realtime Database, and email confirmations)


Getting Started


Clone this repository


bash   git clone <your-repo-url>
   cd myscheduler


Create a Firebase project at firebase.google.com via the Firebase Console
Copy your Firebase config credentials into the project's environment/config file
Install dependencies and run the app


bash   npm install
   npm run dev

Owner Access

The owner dashboard is protected by a passcode. Set your passcode in the environment configuration before running the app.

Notes

This project was built as a college assignment/presentation demo. AI responses in the assistant panel may not always be fully accurate — please verify important scheduling details manually.

License

This project is for educational purposes.
