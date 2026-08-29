import PDFDocument from "pdfkit";

const BLUE = "#1e40af";
const DARK = "#1e293b";
const GRAY = "#475569";
const LIGHT_BLUE = "#dbeafe";
const WHITE = "#ffffff";

function addHeader(doc: PDFKit.PDFDocument, title: string) {
  doc.rect(0, 0, doc.page.width, 100).fill(BLUE);
  doc.fontSize(28).font("Helvetica-Bold").fillColor(WHITE).text(title, 50, 35, { width: doc.page.width - 100, align: "center" });
}

function addSectionTitle(doc: PDFKit.PDFDocument, title: string, y?: number) {
  const posY = y ?? doc.y;
  doc.rect(50, posY, doc.page.width - 100, 32).fill(BLUE);
  doc.fontSize(14).font("Helvetica-Bold").fillColor(WHITE).text(title, 60, posY + 8, { width: doc.page.width - 120 });
  doc.fillColor(DARK);
  doc.y = posY + 42;
}

function addParagraph(doc: PDFKit.PDFDocument, text: string) {
  doc.fontSize(10).font("Helvetica").fillColor(GRAY).text(text, 50, doc.y, { width: doc.page.width - 100, lineGap: 4 });
  doc.moveDown(0.5);
}

function addBullet(doc: PDFKit.PDFDocument, text: string) {
  const x = 60;
  doc.fontSize(10).font("Helvetica").fillColor(GRAY);
  doc.text(`•  ${text}`, x, doc.y, { width: doc.page.width - 120, lineGap: 3 });
  doc.moveDown(0.2);
}

function addCheckbox(doc: PDFKit.PDFDocument, text: string, checked = false) {
  const x = 60;
  const y = doc.y;
  doc.rect(x, y + 1, 10, 10).lineWidth(1).stroke(BLUE);
  if (checked) {
    doc.fontSize(10).font("Helvetica-Bold").fillColor(BLUE).text("✓", x + 1.5, y, { width: 10 });
  }
  doc.fontSize(10).font("Helvetica").fillColor(GRAY).text(text, x + 18, y, { width: doc.page.width - 140, lineGap: 3 });
  doc.moveDown(0.4);
}

function addNumberedItem(doc: PDFKit.PDFDocument, num: number, title: string, desc: string) {
  doc.fontSize(11).font("Helvetica-Bold").fillColor(DARK).text(`${num}. ${title}`, 60, doc.y, { width: doc.page.width - 120 });
  doc.fontSize(10).font("Helvetica").fillColor(GRAY).text(desc, 74, doc.y, { width: doc.page.width - 140, lineGap: 3 });
  doc.moveDown(0.5);
}

function addFooter(doc: PDFKit.PDFDocument, pageNum: number) {
  doc.fontSize(8).font("Helvetica").fillColor(GRAY);
  doc.text(`Drivorata  |  Texas Driving School Growth Toolkit  |  Page ${pageNum}`, 50, doc.page.height - 40, { width: doc.page.width - 100, align: "center" });
}

export function generateToolkitPDF(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margins: { top: 50, bottom: 60, left: 50, right: 50 } });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ===== PAGE 1 — Cover =====
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(BLUE);
    doc.fontSize(36).font("Helvetica-Bold").fillColor(WHITE).text("The Texas Driving School", 50, 180, { width: doc.page.width - 100, align: "center" });
    doc.fontSize(36).font("Helvetica-Bold").fillColor(WHITE).text("Owner's Growth Toolkit", 50, doc.y, { width: doc.page.width - 100, align: "center" });
    doc.moveDown(1.5);
    doc.fontSize(16).font("Helvetica").fillColor(LIGHT_BLUE).text("5 Essential Resources to Grow Enrollment,", 50, doc.y, { width: doc.page.width - 100, align: "center" });
    doc.fontSize(16).font("Helvetica").fillColor(LIGHT_BLUE).text("Streamline Operations & Stay TDLR Compliant", 50, doc.y, { width: doc.page.width - 100, align: "center" });
    doc.moveDown(3);
    doc.fontSize(12).font("Helvetica").fillColor(WHITE).text("Prepared by Drivorata", 50, doc.y, { width: doc.page.width - 100, align: "center" });
    doc.fontSize(10).font("Helvetica").fillColor(LIGHT_BLUE).text("www.drivorata.com", 50, doc.y + 20, { width: doc.page.width - 100, align: "center" });

    // ===== PAGE 2 — Table of Contents =====
    doc.addPage();
    addHeader(doc, "What's Inside");
    doc.y = 130;
    const toc = [
      { num: 1, title: "Website Conversion Checklist", desc: "Turn your website visitors into enrolled students" },
      { num: 2, title: "Enrollment & Payment Workflow", desc: "Streamline the sign-up-to-first-lesson journey" },
      { num: 3, title: "Scheduling & Instructor Utilization Guide", desc: "Maximize instructor time and minimize no-shows" },
      { num: 4, title: "TDLR Compliance Readiness Checklist", desc: "Stay audit-ready with organized records" },
      { num: 5, title: "Course Package Pricing Guide", desc: "Price competitively while maintaining healthy margins" },
    ];
    toc.forEach((item) => {
      addNumberedItem(doc, item.num, item.title, item.desc);
      doc.moveDown(0.3);
    });
    doc.moveDown(1);
    addParagraph(doc, "Each resource is designed specifically for Texas driving schools — whether you run one location or ten. Use them individually or together as a complete growth system.");
    addFooter(doc, 2);

    // ===== PAGE 3 — Resource 1: Website Conversion Checklist =====
    doc.addPage();
    addHeader(doc, "Resource 1: Website Conversion Checklist");
    doc.y = 130;
    addParagraph(doc, "Your website is your #1 enrollment tool. These items will help you convert more visitors into paying students.");
    doc.moveDown(0.5);

    addSectionTitle(doc, "Homepage Essentials");
    addCheckbox(doc, "Clear headline stating what you offer and for whom (e.g., 'Texas TDLR-Approved Driving Courses for Teens & Adults')");
    addCheckbox(doc, "Prominent 'Enroll Now' button above the fold — visible without scrolling");
    addCheckbox(doc, "Phone number displayed in the header for quick calls");
    addCheckbox(doc, "Trust indicators: TDLR license number, years in business, student count");
    addCheckbox(doc, "Professional photos of your school, vehicles, and instructors");
    addCheckbox(doc, "Testimonials from real students and parents with full names");
    doc.moveDown(0.5);

    addSectionTitle(doc, "Course Information");
    addCheckbox(doc, "Course packages with clear pricing (no 'call for pricing')");
    addCheckbox(doc, "What's included in each package (hours, classroom vs. in-car)");
    addCheckbox(doc, "Age requirements clearly stated (14+ for classroom, 15+ for behind-the-wheel)");
    addCheckbox(doc, "Schedule availability shown (upcoming class start dates)");
    addCheckbox(doc, "Instruction method noted: Concurrent or Sequential per TDLR rules");
    doc.moveDown(0.5);

    addSectionTitle(doc, "Technical Requirements");
    addCheckbox(doc, "Mobile-responsive design (60%+ of traffic comes from phones)");
    addCheckbox(doc, "Page load time under 3 seconds");
    addCheckbox(doc, "SSL certificate installed (https://)");
    addCheckbox(doc, "Online enrollment form accessible from every page");
    addCheckbox(doc, "Google Analytics or equivalent tracking installed");
    addFooter(doc, 3);

    // ===== PAGE 4 — Resource 2: Enrollment & Payment Workflow =====
    doc.addPage();
    addHeader(doc, "Resource 2: Enrollment & Payment Workflow");
    doc.y = 130;
    addParagraph(doc, "A smooth enrollment process reduces drop-offs and gets students from 'interested' to 'paid and scheduled' as fast as possible.");
    doc.moveDown(0.5);

    addSectionTitle(doc, "Ideal Enrollment Flow");
    addNumberedItem(doc, 1, "Student Visits Website", "They find your school via Google, social media, or referral. Your homepage immediately shows courses and pricing.");
    addNumberedItem(doc, 2, "Selects a Course Package", "Student picks the right package (e.g., Teen 32-Hour Course, Adult 6-Hour Course). Clear descriptions and pricing remove friction.");
    addNumberedItem(doc, 3, "Completes Enrollment Form", "Collects: student name, DOB, email, phone, parent/guardian info (if under 18), emergency contact. Keep it to one page.");
    addNumberedItem(doc, 4, "Pays Online", "Accept credit/debit cards via Stripe and/or PayPal. Offer payment plans for larger packages. Send instant receipt via email.");
    addNumberedItem(doc, 5, "Receives Confirmation", "Auto-send: enrollment confirmation, course details, what to bring, first class date/time, cancellation policy.");
    addNumberedItem(doc, 6, "Gets Scheduled", "Student appears on your scheduling dashboard, credits are assigned, and they can book their first session.");
    doc.moveDown(0.5);

    addSectionTitle(doc, "Payment Best Practices");
    addBullet(doc, "Accept both Stripe (credit cards) and PayPal to maximize conversion");
    addBullet(doc, "Offer payment plans for packages over $300 — this increases enrollment by 20-30%");
    addBullet(doc, "Send automated payment reminders for outstanding balances");
    addBullet(doc, "Keep a credit ledger per student tracking classroom and driving credits");
    addBullet(doc, "Auto-transition enrollment status: Pending → Confirmed → In Progress → Completed");
    addFooter(doc, 4);

    // ===== PAGE 5 — Resource 3: Scheduling Guide =====
    doc.addPage();
    addHeader(doc, "Resource 3: Scheduling & Instructor Guide");
    doc.y = 130;
    addParagraph(doc, "Efficient scheduling is the difference between a profitable school and one leaving money on the table. Here's how to maximize utilization.");
    doc.moveDown(0.5);

    addSectionTitle(doc, "Instructor Availability Setup");
    addBullet(doc, "Have each instructor submit weekly availability windows (e.g., Mon-Fri 8AM-5PM, Sat 9AM-1PM)");
    addBullet(doc, "Assign instructor types per location: Classroom, Behind-the-Wheel, or Both");
    addBullet(doc, "Track instructor certifications and TDLR license expiration dates");
    addBullet(doc, "Set a target utilization rate of 75-85% — higher leads to burnout, lower loses money");
    doc.moveDown(0.5);

    addSectionTitle(doc, "Session Scheduling Best Practices");
    addBullet(doc, "Create recurring classroom sessions (e.g., every Saturday 9AM-1PM for 4 weeks)");
    addBullet(doc, "Behind-the-wheel slots: 2-hour blocks work best with 15-min buffer between students");
    addBullet(doc, "Always assign a vehicle to driving sessions — check for conflicts before confirming");
    addBullet(doc, "Set a cancellation window (24-48 hours minimum) to avoid last-minute no-shows");
    addBullet(doc, "Allow students to book from their portal — reduces admin phone calls by 60%");
    doc.moveDown(0.5);

    addSectionTitle(doc, "Reducing No-Shows");
    addBullet(doc, "Send SMS/email reminders 24 hours before each session");
    addBullet(doc, "Charge a no-show fee or deduct a driving credit for unexcused absences");
    addBullet(doc, "Offer easy online rescheduling within the cancellation window");
    addBullet(doc, "Track no-show rates per student — flag repeat offenders");
    addBullet(doc, "Maintain a waitlist so cancelled slots get filled automatically");
    doc.moveDown(0.5);

    addSectionTitle(doc, "Vehicle Fleet Management");
    addBullet(doc, "Track each vehicle: make, model, year, license plate, insurance expiration");
    addBullet(doc, "Schedule regular maintenance (oil changes, brake checks, tire rotations)");
    addBullet(doc, "Set vehicle status: Active, Maintenance, Retired");
    addBullet(doc, "Assign vehicles to specific locations if running multi-location operations");
    addFooter(doc, 5);

    // ===== PAGE 6 — Resource 4: TDLR Compliance Checklist =====
    doc.addPage();
    addHeader(doc, "Resource 4: TDLR Compliance Checklist");
    doc.y = 130;
    addParagraph(doc, "The Texas Department of Licensing and Regulation (TDLR) requires driving schools to maintain specific records and follow approved instruction methods. Use this checklist to stay audit-ready.");
    doc.moveDown(0.5);

    addSectionTitle(doc, "School License Requirements");
    addCheckbox(doc, "Valid TDLR driving school license displayed at each location");
    addCheckbox(doc, "All instructors hold current TDLR instructor licenses");
    addCheckbox(doc, "School bond or insurance documentation current and on file");
    addCheckbox(doc, "Course curriculum approved by TDLR and kept on file");
    addCheckbox(doc, "Business name matches TDLR records exactly");
    doc.moveDown(0.5);

    addSectionTitle(doc, "Student Records");
    addCheckbox(doc, "Enrollment agreement signed by student (and parent if under 18)");
    addCheckbox(doc, "Student date of birth verified against age requirements");
    addCheckbox(doc, "Attendance records for all classroom and behind-the-wheel sessions");
    addCheckbox(doc, "Completion certificates issued with correct dates and hours");
    addCheckbox(doc, "Records retained for minimum 4 years as required by TDLR");
    doc.moveDown(0.5);

    addSectionTitle(doc, "Course Delivery");
    addCheckbox(doc, "Instruction method documented per course: Concurrent or Sequential");
    addCheckbox(doc, "Concurrent: classroom and driving happen in same time period");
    addCheckbox(doc, "Sequential: all classroom hours completed before driving begins");
    addCheckbox(doc, "Minimum classroom hours met: 32 hours for teens, 6 hours for adults");
    addCheckbox(doc, "Minimum behind-the-wheel hours met: 7 hours for teens (14 hours total with observation)");
    addCheckbox(doc, "Each classroom session documented with date, time, instructor, and topics covered");
    doc.moveDown(0.5);

    addSectionTitle(doc, "Vehicle Requirements");
    addCheckbox(doc, "All training vehicles registered and insured per TDLR requirements");
    addCheckbox(doc, "Dual brake controls installed and functional in all training vehicles");
    addCheckbox(doc, "'Student Driver' sign displayed during all behind-the-wheel sessions");
    addCheckbox(doc, "Vehicle inspection records current and on file");
    addFooter(doc, 6);

    // ===== PAGE 7 — Resource 5: Course Package Pricing =====
    doc.addPage();
    addHeader(doc, "Resource 5: Course Package Pricing Guide");
    doc.y = 130;
    addParagraph(doc, "Pricing your courses competitively while maintaining healthy margins is key to sustainable growth. Here are sample packages based on Texas market data.");
    doc.moveDown(0.5);

    addSectionTitle(doc, "Teen Driver Education (Ages 14-17)");
    doc.moveDown(0.3);
    doc.fontSize(11).font("Helvetica-Bold").fillColor(DARK).text("Package A — Full Teen Course", 60, doc.y, { width: doc.page.width - 120 });
    addBullet(doc, "32 hours classroom instruction + 7 hours behind-the-wheel + 7 hours observation");
    addBullet(doc, "Suggested price range: $350 – $550");
    addBullet(doc, "Include: textbook/materials, certificate of completion, parent orientation");
    doc.moveDown(0.3);
    doc.fontSize(11).font("Helvetica-Bold").fillColor(DARK).text("Package B — Behind-the-Wheel Only", 60, doc.y, { width: doc.page.width - 120 });
    addBullet(doc, "7 hours behind-the-wheel + 7 hours observation (for students who completed classroom elsewhere)");
    addBullet(doc, "Suggested price range: $250 – $400");
    doc.moveDown(0.3);
    doc.fontSize(11).font("Helvetica-Bold").fillColor(DARK).text("Package C — Extra Driving Hours", 60, doc.y, { width: doc.page.width - 120 });
    addBullet(doc, "Additional 2-hour behind-the-wheel sessions for students needing more practice");
    addBullet(doc, "Suggested price range: $80 – $120 per 2-hour session");
    doc.moveDown(0.5);

    addSectionTitle(doc, "Adult Driver Education (Ages 18-24)");
    doc.moveDown(0.3);
    doc.fontSize(11).font("Helvetica-Bold").fillColor(DARK).text("Package D — Adult Course", 60, doc.y, { width: doc.page.width - 120 });
    addBullet(doc, "6 hours classroom instruction + optional behind-the-wheel");
    addBullet(doc, "Suggested price range: $75 – $150 (classroom only)");
    addBullet(doc, "Add-on: 2 hours behind-the-wheel for $80 – $120");
    doc.moveDown(0.5);

    addSectionTitle(doc, "Pricing Tips");
    addBullet(doc, "Research 3-5 competitors in your area and price within 10% of the average");
    addBullet(doc, "Offer an 'early bird' discount (5-10%) for enrollments paid in full at registration");
    addBullet(doc, "Create a referral program: $25-50 credit for each referred student who enrolls");
    addBullet(doc, "Offer payment plans for packages over $300 to reduce enrollment friction");
    addBullet(doc, "Bundle multi-student discounts for families (e.g., 10% off second sibling)");
    addBullet(doc, "Review and adjust pricing annually based on costs and market rates");
    addFooter(doc, 7);

    // ===== PAGE 8 — Next Steps =====
    doc.addPage();
    addHeader(doc, "Your Next Steps");
    doc.y = 130;
    addParagraph(doc, "Congratulations on downloading the Texas Driving School Owner's Growth Toolkit! Here's how to put these resources to work immediately:");
    doc.moveDown(0.5);

    addNumberedItem(doc, 1, "Audit Your Website (This Week)", "Go through the Website Conversion Checklist. Fix the quick wins first — add a clear CTA, display your TDLR license number, and make sure pricing is visible.");
    addNumberedItem(doc, 2, "Streamline Your Enrollment (Next Week)", "Map out your current enrollment process. Identify where students drop off. Implement online payments if you haven't already.");
    addNumberedItem(doc, 3, "Optimize Your Schedule (Week 3)", "Review instructor utilization rates. Set up recurring sessions. Implement a cancellation/no-show policy.");
    addNumberedItem(doc, 4, "Run the TDLR Checklist (Week 4)", "Go through every item. Fix gaps before your next inspection. Set calendar reminders for license renewals.");
    addNumberedItem(doc, 5, "Review Your Pricing (Month 2)", "Compare your packages against local competitors. Test a payment plan option. Launch a referral program.");
    doc.moveDown(1);

    doc.rect(50, doc.y, doc.page.width - 100, 100).lineWidth(2).stroke(BLUE);
    const boxY = doc.y;
    doc.fontSize(14).font("Helvetica-Bold").fillColor(BLUE).text("Ready to automate all of this?", 70, boxY + 15, { width: doc.page.width - 140, align: "center" });
    doc.fontSize(11).font("Helvetica").fillColor(GRAY).text("Drivorata handles enrollment, payments, scheduling, fleet management, and TDLR compliance — all from one dashboard. Book a free 15-minute demo to see it in action.", 70, boxY + 40, { width: doc.page.width - 140, align: "center", lineGap: 3 });
    doc.fontSize(12).font("Helvetica-Bold").fillColor(BLUE).text("Visit: www.drivorata.com", 70, boxY + 78, { width: doc.page.width - 140, align: "center" });

    addFooter(doc, 8);

    doc.end();
  });
}
