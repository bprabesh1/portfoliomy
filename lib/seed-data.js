'use strict';
// Shared seed content (used by the Node server, the Cloudflare Worker and the SQL builder).
const DEFAULT_SETTINGS = {
  site_title: 'Prabesh | The Summit Journey',
  meta_description: 'Prabesh Bhusal - Software Developer & Network Administrator from Bhairahawa, Nepal. Follow the climb from school to the summit.',
  name: 'Prabesh',
  full_name: 'Prabesh Bhusal',
  title: 'Software Developer',
  hero_headline: 'Climbing Beyond Limits.',
  hero_subtitle: 'Every step tells a story. Every achievement brings me closer to the top.',
  hero_badge: 'Software Developer | Network Administrator',
  hero_image: '/assets/img/portrait.webp',
  location: 'Bhairahawa, Nepal',
  about_quote: 'Passionate about building software, solving problems and continuously learning new technologies.',
  about_intro: 'I’m an IT graduate with a Bachelor of Information Management (BIM) degree and practical experience in software development, database systems, networking and technical support. At Care Computer Sewa I worked as a Software Developer and Network Administrator, contributing to application development, database design, network administration and troubleshooting.',
  about_interests: 'Full-stack web applications, relational database design, and reliable IT infrastructure such as LAN/WLAN networks.',
  about_direction: 'Growing as a software developer while keeping strong foundations in databases, networking and IT support.',
  about_approach: 'Practical, clean solutions: understand the problem, design the data first, build it, then test and debug every feature.',
  about_mindset: 'Teamwork, fast adaptation and continuous learning. I believe technology should be practical, reliable and accessible.',
  email: '', phone: '', github: '', linkedin: '', portfolio: '',
  contact_heading: 'Let’s build something great together.',
  contact_text: 'Have a project, an opportunity or just a question? Send a message and I’ll get back to you.',
  summit_title: 'The journey never ends.',
  summit_quote: 'Every step, every challenge and every achievement has brought me closer to my goals.',
  summit_roles: 'Software Developer | Continuous Learner | Problem Solver',
  final_message: 'The summit is not the end. It is the beginning of a new journey.',
  resume_file: '',
  resume_label: 'Resume',
};

const SEED_MILESTONES = [
  { category: 'education', title: 'Secondary Education Examination (SEE)', organization: 'Montessori Memorial English Boarding High School, Bhairahawa',
    date_label: '2019', start_date: '2019-01', sort_order: 1,
    description: 'Foundational secondary school education with distinction in computer science and mathematics, sparking early passion for computing.',
    skills: ['Basic Computing', 'Logic & Math', 'Scientific Inquiry'], quote: 'Every great journey begins at the foot of the mountain.' },
  { category: 'education', title: 'Intermediate (10+2)', organization: 'New Horizon College, Butwal',
    date_label: '2019 – 2021', start_date: '2019-06', sort_order: 2,
    description: 'Higher secondary education focusing on computer science, fundamentals of programming, logic design, and analytical problem solving.',
    skills: ['C Programming', 'Web Fundamentals', 'Database Basics'], quote: 'Curiosity turned into logic, and logic into code.' },
  { category: 'education', title: 'Bachelor of Information Management (BIM)', organization: 'Tribhuvan University, Nepal',
    date_label: '2021 – 2026', start_date: '2021-01', sort_order: 3,
    description: 'Comprehensive undergraduate degree synthesizing information technology and managerial science: software engineering, database systems, networking, enterprise systems, and business intelligence.',
    skills: ['Software Engineering', 'Enterprise Databases', 'System Analysis', 'Network Protocols'], quote: 'Knowledge is the foundation of every great journey.' },
  { category: 'training', title: 'Accounting Software Training', organization: 'Siddharthanagar Municipality',
    date_label: '2023', start_date: '2023-01', sort_order: 4,
    description: 'Specialized municipal training in enterprise accounting software, digital ledger systems, fiscal record management, and automated receipt processing.',
    skills: ['Accounting Software', 'Financial Records', 'Municipal Workflows'], quote: 'Real skills are built where theory meets daily work.' },
  { category: 'certificate', title: 'Advanced Diploma in Computer Application (ADCA)', organization: 'Training & Certification Institute',
    date_label: 'March 2024 – March 2025', start_date: '2024-03', sort_order: 5,
    description: 'Intensive 1-year professional diploma covering full-stack web applications, advanced relational database modeling, systems troubleshooting, and practical software design.',
    skills: ['PHP', 'MySQL', 'Full-Stack Web', 'Troubleshooting'], quote: 'The higher the climb, the wider the view.' },
  { category: 'experience', title: 'Software Developer & Network Administrator', organization: 'Care Computer Sewa, Butwal-6',
    date_label: 'September 2025 – October 2026', start_date: '2025-09', sort_order: 6,
    description: 'Engineered web applications and internal tools, designed and normalized MySQL schemas, administered enterprise LAN/WLAN infrastructure, and provided comprehensive technical troubleshooting and printer/device support.',
    skills: ['Network Admin', 'MySQL Architecture', 'Full-Stack Apps', 'Infrastructure Support'], quote: 'Experience is the rope that holds every next step.' },
];

const SEED_CERTS = [
  { title: 'Advanced Diploma in Computer Application (ADCA)', issuer: 'Training & Certification Institute', date_label: 'March 2024 – March 2025', issue_date: '2025-03',
    description: 'Intensive 1-year professional diploma covering full-stack web applications, advanced relational database modeling, systems troubleshooting, and practical software design.', sort_order: 1 },
  { title: 'Accounting Software Training', issuer: 'Siddharthanagar Municipality', date_label: '2023', issue_date: '2023-01',
    description: 'Specialized municipal training in enterprise accounting software, digital ledger systems, fiscal record management, and automated receipt processing.', sort_order: 2 },
];

const SEED_PROJECTS = [
  { name: 'E-Learning Management System', status: 'Completed', sort_order: 1,
    description: 'Full-stack e-learning platform with separate admin and student dashboards, protected video lessons, payment-based approval and session-limit access control. Designed the MySQL schema and tested and debugged all features.',
    tech: ['HTML', 'CSS', 'JavaScript', 'PHP', 'MySQL'],
    features: ['Role-based authentication and student verification workflow', 'Protected video lesson player with session limits', 'Normalized relational MySQL schema', 'Fee payment verification and enrollment certificates'] },
];

const SEED_SKILLS = [
  ['Programming', ['Python', 'PHP', 'JavaScript', 'Java', 'C']],
  ['Web Development', ['HTML', 'CSS', 'JavaScript', 'Bootstrap', 'React', 'Node.js', 'Responsive Web Design']],
  ['Databases', ['MySQL', 'MongoDB', 'SQL Queries', 'Database Design', 'Database Management', 'CRUD Operations', 'Database Integration']],
  ['Software Engineering', ['RESTful API Development and Integration', 'Software Testing', 'Debugging', 'Application Development and Maintenance']],
  ['Networking & Systems', ['LAN/WLAN Administration', 'Network Device Configuration', 'Network Monitoring', 'Hardware & Software Troubleshooting', 'Printer Configuration', 'Technical Support']],
  ['Tools', ['Git', 'GitHub', 'VS Code', 'XAMPP', 'phpMyAdmin', 'Microsoft Power BI']],
];

module.exports = { DEFAULT_SETTINGS, SEED_MILESTONES, SEED_CERTS, SEED_PROJECTS, SEED_SKILLS };
