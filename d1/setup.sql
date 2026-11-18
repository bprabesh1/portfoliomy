-- Prabesh Summit Journey: Cloudflare D1 setup (schema + content + first admin)
-- Paste into D1 > your database > Console, or: wrangler d1 execute portfolio --remote --file=d1/setup.sql

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('super','editor')),
  security_question TEXT NOT NULL DEFAULT '',
  security_answer_hash TEXT NOT NULL DEFAULT '',
  must_change INTEGER NOT NULL DEFAULT 0,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_login INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  ip TEXT NOT NULL DEFAULT '',
  ua TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS reset_tokens (
  token_hash TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL DEFAULT 'education',
  title TEXT NOT NULL,
  organization TEXT NOT NULL DEFAULT '',
  date_label TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  skills TEXT NOT NULL DEFAULT '[]',
  quote TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS certificates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  issuer TEXT NOT NULL DEFAULT '',
  date_label TEXT NOT NULL DEFAULT '',
  issue_date TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  credential_url TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  tech TEXT NOT NULL DEFAULT '[]',
  features TEXT NOT NULL DEFAULT '[]',
  github_url TEXT NOT NULL DEFAULT '',
  live_url TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS skill_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  items TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread','read')),
  ip_hash TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);
CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  day TEXT NOT NULL,
  visitor TEXT NOT NULL,
  path TEXT NOT NULL DEFAULT '/',
  referrer TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT 'desktop',
  country TEXT NOT NULL DEFAULT '',
  is_new INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_visits_day ON visits(day);
CREATE INDEX IF NOT EXISTS idx_visits_ts ON visits(ts);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  day TEXT NOT NULL,
  visitor TEXT NOT NULL,
  type TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_events_day ON events(day, type);

CREATE TABLE IF NOT EXISTS rate_limits (k TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS files (name TEXT PRIMARY KEY, mime TEXT NOT NULL, size INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS file_chunks (name TEXT NOT NULL, idx INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (name, idx));

INSERT OR IGNORE INTO settings (key,value) VALUES ('site_title','Prabesh | The Summit Journey');
INSERT OR IGNORE INTO settings (key,value) VALUES ('meta_description','Prabesh Bhusal - Software Developer & Network Administrator from Bhairahawa, Nepal. Follow the climb from school to the summit.');
INSERT OR IGNORE INTO settings (key,value) VALUES ('name','Prabesh');
INSERT OR IGNORE INTO settings (key,value) VALUES ('full_name','Prabesh Bhusal');
INSERT OR IGNORE INTO settings (key,value) VALUES ('title','Software Developer');
INSERT OR IGNORE INTO settings (key,value) VALUES ('hero_headline','Climbing Beyond Limits.');
INSERT OR IGNORE INTO settings (key,value) VALUES ('hero_subtitle','Every step tells a story. Every achievement brings me closer to the top.');
INSERT OR IGNORE INTO settings (key,value) VALUES ('hero_badge','Software Developer | Network Administrator');
INSERT OR IGNORE INTO settings (key,value) VALUES ('hero_image','/assets/img/portrait.webp');
INSERT OR IGNORE INTO settings (key,value) VALUES ('location','Bhairahawa, Nepal');
INSERT OR IGNORE INTO settings (key,value) VALUES ('about_quote','Passionate about building software, solving problems and continuously learning new technologies.');
INSERT OR IGNORE INTO settings (key,value) VALUES ('about_intro','I’m an IT graduate with a Bachelor of Information Management (BIM) degree and practical experience in software development, database systems, networking and technical support. At Care Computer Sewa I worked as a Software Developer and Network Administrator, contributing to application development, database design, network administration and troubleshooting.');
INSERT OR IGNORE INTO settings (key,value) VALUES ('about_interests','Full-stack web applications, relational database design, and reliable IT infrastructure such as LAN/WLAN networks.');
INSERT OR IGNORE INTO settings (key,value) VALUES ('about_direction','Growing as a software developer while keeping strong foundations in databases, networking and IT support.');
INSERT OR IGNORE INTO settings (key,value) VALUES ('about_approach','Practical, clean solutions: understand the problem, design the data first, build it, then test and debug every feature.');
INSERT OR IGNORE INTO settings (key,value) VALUES ('about_mindset','Teamwork, fast adaptation and continuous learning. I believe technology should be practical, reliable and accessible.');
INSERT OR IGNORE INTO settings (key,value) VALUES ('email','');
INSERT OR IGNORE INTO settings (key,value) VALUES ('phone','');
INSERT OR IGNORE INTO settings (key,value) VALUES ('github','');
INSERT OR IGNORE INTO settings (key,value) VALUES ('linkedin','');
INSERT OR IGNORE INTO settings (key,value) VALUES ('portfolio','');
INSERT OR IGNORE INTO settings (key,value) VALUES ('contact_heading','Let’s build something great together.');
INSERT OR IGNORE INTO settings (key,value) VALUES ('contact_text','Have a project, an opportunity or just a question? Send a message and I’ll get back to you.');
INSERT OR IGNORE INTO settings (key,value) VALUES ('summit_title','The journey never ends.');
INSERT OR IGNORE INTO settings (key,value) VALUES ('summit_quote','Every step, every challenge and every achievement has brought me closer to my goals.');
INSERT OR IGNORE INTO settings (key,value) VALUES ('summit_roles','Software Developer | Continuous Learner | Problem Solver');
INSERT OR IGNORE INTO settings (key,value) VALUES ('final_message','The summit is not the end. It is the beginning of a new journey.');
INSERT OR IGNORE INTO settings (key,value) VALUES ('resume_file','');
INSERT OR IGNORE INTO settings (key,value) VALUES ('resume_label','Resume');
INSERT INTO milestones (category,title,organization,date_label,start_date,description,skills,quote,sort_order) VALUES ('education','Secondary Education Examination (SEE)','Montessori Memorial English Boarding High School, Bhairahawa','2019','2019-01','Foundational secondary school education with distinction in computer science and mathematics, sparking early passion for computing.','["Basic Computing","Logic & Math","Scientific Inquiry"]','Every great journey begins at the foot of the mountain.',1);
INSERT INTO milestones (category,title,organization,date_label,start_date,description,skills,quote,sort_order) VALUES ('education','Intermediate (10+2)','New Horizon College, Butwal','2019 – 2021','2019-06','Higher secondary education focusing on computer science, fundamentals of programming, logic design, and analytical problem solving.','["C Programming","Web Fundamentals","Database Basics"]','Curiosity turned into logic, and logic into code.',2);
INSERT INTO milestones (category,title,organization,date_label,start_date,description,skills,quote,sort_order) VALUES ('education','Bachelor of Information Management (BIM)','Tribhuvan University, Nepal','2021 – 2026','2021-01','Comprehensive undergraduate degree synthesizing information technology and managerial science: software engineering, database systems, networking, enterprise systems, and business intelligence.','["Software Engineering","Enterprise Databases","System Analysis","Network Protocols"]','Knowledge is the foundation of every great journey.',3);
INSERT INTO milestones (category,title,organization,date_label,start_date,description,skills,quote,sort_order) VALUES ('training','Accounting Software Training','Siddharthanagar Municipality','2023','2023-01','Specialized municipal training in enterprise accounting software, digital ledger systems, fiscal record management, and automated receipt processing.','["Accounting Software","Financial Records","Municipal Workflows"]','Real skills are built where theory meets daily work.',4);
INSERT INTO milestones (category,title,organization,date_label,start_date,description,skills,quote,sort_order) VALUES ('certificate','Advanced Diploma in Computer Application (ADCA)','Training & Certification Institute','March 2024 – March 2025','2024-03','Intensive 1-year professional diploma covering full-stack web applications, advanced relational database modeling, systems troubleshooting, and practical software design.','["PHP","MySQL","Full-Stack Web","Troubleshooting"]','The higher the climb, the wider the view.',5);
INSERT INTO milestones (category,title,organization,date_label,start_date,description,skills,quote,sort_order) VALUES ('experience','Software Developer & Network Administrator','Care Computer Sewa, Butwal-6','September 2025 – October 2026','2025-09','Engineered web applications and internal tools, designed and normalized MySQL schemas, administered enterprise LAN/WLAN infrastructure, and provided comprehensive technical troubleshooting and printer/device support.','["Network Admin","MySQL Architecture","Full-Stack Apps","Infrastructure Support"]','Experience is the rope that holds every next step.',6);
INSERT INTO certificates (title,issuer,date_label,issue_date,description,sort_order) VALUES ('Advanced Diploma in Computer Application (ADCA)','Training & Certification Institute','March 2024 – March 2025','2025-03','Intensive 1-year professional diploma covering full-stack web applications, advanced relational database modeling, systems troubleshooting, and practical software design.',1);
INSERT INTO certificates (title,issuer,date_label,issue_date,description,sort_order) VALUES ('Accounting Software Training','Siddharthanagar Municipality','2023','2023-01','Specialized municipal training in enterprise accounting software, digital ledger systems, fiscal record management, and automated receipt processing.',2);
INSERT INTO projects (name,description,status,tech,features,sort_order) VALUES ('E-Learning Management System','Full-stack e-learning platform with separate admin and student dashboards, protected video lessons, payment-based approval and session-limit access control. Designed the MySQL schema and tested and debugged all features.','Completed','["HTML","CSS","JavaScript","PHP","MySQL"]','["Role-based authentication and student verification workflow","Protected video lesson player with session limits","Normalized relational MySQL schema","Fee payment verification and enrollment certificates"]',1);
INSERT INTO skill_categories (title,items,sort_order) VALUES ('Programming','["Python","PHP","JavaScript","Java","C"]',1);
INSERT INTO skill_categories (title,items,sort_order) VALUES ('Web Development','["HTML","CSS","JavaScript","Bootstrap","React","Node.js","Responsive Web Design"]',2);
INSERT INTO skill_categories (title,items,sort_order) VALUES ('Databases','["MySQL","MongoDB","SQL Queries","Database Design","Database Management","CRUD Operations","Database Integration"]',3);
INSERT INTO skill_categories (title,items,sort_order) VALUES ('Software Engineering','["RESTful API Development and Integration","Software Testing","Debugging","Application Development and Maintenance"]',4);
INSERT INTO skill_categories (title,items,sort_order) VALUES ('Networking & Systems','["LAN/WLAN Administration","Network Device Configuration","Network Monitoring","Hardware & Software Troubleshooting","Printer Configuration","Technical Support"]',5);
INSERT INTO skill_categories (title,items,sort_order) VALUES ('Tools','["Git","GitHub","VS Code","XAMPP","phpMyAdmin","Microsoft Power BI"]',6);

INSERT INTO admins (username,display_name,email,password_hash,role,must_change,created_at) VALUES ('prabesh','Prabesh','','pbkdf2$100000$w7PU6SF8VSzAmrnxCgaKKQ==$70xYHXsvC6IK/QsGAmDlqgjsNAQLBlWQrtZ9OUTF2DY=','super',1,1795010929465);
