export interface PageSection {
  id?: string;
  type: string;
  title?: string;
  subtitle?: string;
  content?: any;
  visible: boolean;
  order: number;
  variant?: string;
  style?: Record<string, any>;
}

export interface PageTemplate {
  title: string;
  slug: string;
  sections: PageSection[];
  sortOrder: number;
  showInNav: boolean;
}

export interface WebsiteTemplate {
  id: string;
  name: string;
  description: string;
  previewColors: { primary: string; accent: string; bg: string };
  pages: PageTemplate[];
}

function genId() {
  return Math.random().toString(36).substring(2, 10);
}

function buildSections(sections: Omit<PageSection, "id" | "order">[]): PageSection[] {
  return sections.map((s, i) => ({ ...s, id: genId(), order: i }));
}

function personalize(text: string, schoolName: string): string {
  return text.replace(/\{schoolName\}/g, schoolName);
}

function personalizeSection(section: PageSection, schoolName: string): PageSection {
  const s = { ...section };
  if (s.title) s.title = personalize(s.title, schoolName);
  if (s.subtitle) s.subtitle = personalize(s.subtitle, schoolName);
  if (s.content && typeof s.content === "object") {
    s.content = JSON.parse(personalize(JSON.stringify(s.content), schoolName));
  }
  return s;
}

export function personalizeTemplate(template: WebsiteTemplate, schoolName: string): WebsiteTemplate {
  return {
    ...template,
    pages: template.pages.map((p) => ({
      ...p,
      sections: p.sections.map((s) => personalizeSection(s, schoolName)),
    })),
  };
}

const modernBold: WebsiteTemplate = {
  id: "modern-bold",
  name: "Modern & Bold",
  description: "Large hero, strong accent colors, geometric styling with bold section dividers",
  previewColors: { primary: "#1e40af", accent: "#f59e0b", bg: "#0f172a" },
  pages: [
    {
      title: "Home",
      slug: "home",
      sortOrder: 0,
      showInNav: true,
      sections: buildSections([
        {
          type: "hero",
          visible: true,
          content: {
            heading: "Master the Road with {schoolName}",
            subheading: "Texas TDLR-approved driver education — where confidence meets the open road",
            buttonText: "Enroll Today",
            buttonLink: "/enroll",
            backgroundImage: "",
            gradientText: { from: "#f59e0b", to: "#ffffff" },
          },
          variant: "centered",
          style: { padding: "large", backgroundColor: "#1e3a5f", textColor: "#ffffff", shadow: "lg", animation: "fade-in" },
        },
        {
          type: "stats",
          visible: true,
          content: {
            heading: "Proven Results",
            items: [
              { value: "2,000+", label: "Students Graduated", icon: "graduation-cap" },
              { value: "98%", label: "First-Time Pass Rate", icon: "trending-up" },
              { value: "15+", label: "Years of Excellence", icon: "award" },
              { value: "4.9", label: "Student Rating", icon: "star" },
            ],
          },
          style: { padding: "medium", backgroundColor: "#f59e0b", textColor: "#0f172a", animation: "slide-up" },
        },
        {
          type: "process",
          visible: true,
          content: {
            heading: "How to Get Started",
            description: "Four simple steps to becoming a confident, licensed driver",
            steps: [
              { title: "Register Online", description: "Fill out our quick enrollment form — it takes just 2 minutes.", icon: "check-circle" },
              { title: "Choose Your Package", description: "Pick the course that fits your schedule and budget.", icon: "book-open" },
              { title: "Start Learning", description: "Attend classroom sessions and practice behind the wheel.", icon: "car" },
              { title: "Get Licensed", description: "Pass your exam with confidence and hit the open road!", icon: "trophy" },
            ],
          },
          variant: "horizontal",
          style: { padding: "large", animation: "slide-up" },
        },
        {
          type: "features",
          visible: true,
          content: {
            heading: "The {schoolName} Advantage",
            items: [
              { title: "State-Certified Instructors", description: "Every instructor holds a Texas TDLR certification with years of real-world teaching experience.", icon: "shield" },
              { title: "Flexible Class Schedules", description: "Morning, evening, and weekend classes to fit any lifestyle — you pick the time that works.", icon: "clock" },
              { title: "Late-Model Vehicles", description: "Train in modern, well-maintained vehicles equipped with dual braking systems for your safety.", icon: "car" },
            ],
          },
          variant: "cards",
          style: { padding: "large", animation: "slide-up" },
        },
        {
          type: "packages",
          visible: true,
          content: { heading: "Course Packages" },
          style: { padding: "large" },
        },
        {
          type: "testimonials",
          visible: true,
          content: {
            heading: "What Students Say",
            items: [
              { name: "Alex R.", text: "I was nervous before my first lesson but the instructors at {schoolName} made me feel right at home. Passed on my first try!", rating: 5, role: "Recent Graduate" },
              { name: "Jennifer T.", text: "The scheduling flexibility was a lifesaver — I could book lessons around my college schedule without any issues.", rating: 5, role: "College Student" },
              { name: "Carlos M.", text: "My daughter gained so much confidence behind the wheel. Highly recommend {schoolName} to every parent.", rating: 5, role: "Parent" },
            ],
          },
          variant: "carousel",
          style: { padding: "large", animation: "fade-in" },
        },
        {
          type: "newsletter",
          visible: true,
          content: {
            heading: "Stay in the Loop",
            description: "Get the latest driving tips, special offers, and enrollment updates delivered to your inbox.",
            buttonText: "Subscribe",
            placeholder: "Your email address",
            successMessage: "You're subscribed! Check your inbox for a welcome message.",
            privacyText: "We respect your privacy. Unsubscribe anytime.",
          },
          style: { padding: "medium", backgroundColor: "#f8fafc", animation: "fade-in" },
        },
        {
          type: "cta",
          visible: true,
          content: {
            heading: "Start Your Driving Journey Today",
            subheading: "Enroll now and get behind the wheel with Texas's most trusted driving school",
            buttonText: "View Packages & Enroll",
            buttonLink: "/enroll",
          },
          variant: "centered",
          style: { padding: "large", backgroundColor: "#1e40af", textColor: "#ffffff", animation: "fade-in" },
        },
      ]),
    },
    {
      title: "About Us",
      slug: "about",
      sortOrder: 1,
      showInNav: true,
      sections: buildSections([
        {
          type: "hero",
          visible: true,
          content: {
            heading: "About {schoolName}",
            subheading: "Building safe, confident drivers since day one",
            buttonText: "",
            buttonLink: "",
            backgroundImage: "",
          },
          variant: "centered",
          style: { padding: "large", backgroundColor: "#1e3a5f", textColor: "#ffffff" },
        },
        {
          type: "text",
          visible: true,
          content: {
            heading: "Our Mission",
            body: "<p>{schoolName} was founded with a clear mission: to provide the highest quality driver education in Texas. We believe that every student deserves personalized instruction, modern training tools, and an environment that builds real confidence on the road.</p><p>Our TDLR-approved curriculum goes beyond the basics. We teach defensive driving techniques, hazard awareness, and the habits that create safe drivers for life.</p>",
          },
          variant: "default",
          style: { padding: "large", animation: "slide-up" },
        },
        {
          type: "team",
          visible: true,
          content: {
            heading: "Meet Our Instructors",
            members: [
              { name: "Lead Instructor", role: "Senior Driving Instructor", bio: "Over 15 years of experience in driver education. Specializes in building confidence in first-time drivers.", photo: "", certifications: "Texas TDLR Certified" },
              { name: "Assistant Instructor", role: "Driving Instructor", bio: "Expert in highway driving and defensive techniques. Patient, supportive approach to instruction.", photo: "", certifications: "Texas TDLR Certified" },
            ],
          },
          variant: "grid",
          style: { padding: "large", animation: "slide-up" },
        },
        {
          type: "stats",
          visible: true,
          content: {
            heading: "Our Track Record",
            items: [
              { value: "2,000+", label: "Students Trained", icon: "users" },
              { value: "15+", label: "Years Teaching", icon: "calendar" },
              { value: "98%", label: "Pass Rate", icon: "check-circle" },
              { value: "5.0", label: "Avg. Rating", icon: "star" },
            ],
          },
          style: { padding: "medium", backgroundColor: "#f59e0b", textColor: "#0f172a" },
        },
      ]),
    },
    {
      title: "Packages",
      slug: "packages",
      sortOrder: 2,
      showInNav: true,
      sections: buildSections([
        {
          type: "hero",
          visible: true,
          content: {
            heading: "Course Packages & Pricing",
            subheading: "Affordable, comprehensive programs for teens and adults",
            buttonText: "",
            buttonLink: "",
            backgroundImage: "",
          },
          variant: "centered",
          style: { padding: "large", backgroundColor: "#1e3a5f", textColor: "#ffffff" },
        },
        {
          type: "packages",
          visible: true,
          content: { heading: "Choose Your Course" },
          style: { padding: "large" },
        },
        {
          type: "features",
          visible: true,
          content: {
            heading: "Every Course Includes",
            items: [
              { title: "TDLR-Approved Curriculum", description: "Meets all Texas requirements for driver education certification.", icon: "file-check" },
              { title: "Certificate of Completion", description: "Official certificate issued upon course completion.", icon: "award" },
              { title: "Dual-Control Vehicles", description: "Train safely in vehicles with instructor-side braking systems.", icon: "shield" },
            ],
          },
          variant: "cards",
          style: { padding: "large", animation: "slide-up" },
        },
        {
          type: "comparison",
          visible: true,
          content: {
            heading: "Compare Our Packages",
            featureLabel: "Feature",
            columns: [
              { name: "Basic", price: "$199", description: "Get started" },
              { name: "Standard", price: "$349", description: "Most popular", highlighted: true },
              { name: "Premium", price: "$499", description: "Complete package" },
            ],
            features: [
              { name: "Classroom Hours", values: ["6 hours", "6 hours", "6 hours"] },
              { name: "Behind-the-Wheel Training", values: ["7 hours", "14 hours", "21 hours"] },
              { name: "Practice Tests Included", values: [true, true, true] },
              { name: "Free Pickup & Drop-off", values: [false, true, true] },
              { name: "Road Test Preparation", values: [false, false, true] },
              { name: "Defensive Driving Module", values: [false, true, true] },
            ],
          },
          style: { padding: "large", animation: "slide-up" },
        },
        {
          type: "quiz",
          visible: true,
          content: {
            heading: "Not Sure Which Course Is Right for You?",
            questions: [
              { text: "How old is the student?", options: [{ text: "Under 18", resultKey: "teen" }, { text: "18 or older", resultKey: "adult" }] },
              { text: "What is their current driving experience?", options: [{ text: "Complete beginner", resultKey: "teen" }, { text: "Some experience with a permit", resultKey: "adult" }] },
              { text: "What schedule works best?", options: [{ text: "After school / weekday afternoons", resultKey: "teen" }, { text: "Evenings and weekends", resultKey: "adult" }] },
            ],
            results: [
              { key: "teen", title: "Teen Driver Education", description: "Our comprehensive teen program includes classroom instruction, behind-the-wheel training, and exam preparation — all TDLR approved.", buttonText: "View Teen Packages", buttonLink: "/enroll" },
              { key: "adult", title: "Adult Driver Course", description: "Flexible scheduling with evening and weekend sessions designed for busy adults.", buttonText: "View Adult Packages", buttonLink: "/enroll" },
            ],
          },
          style: { padding: "large", backgroundColor: "#f8fafc", animation: "fade-in" },
        },
        {
          type: "cta",
          visible: true,
          content: {
            heading: "Ready to Get Started?",
            subheading: "Pick the package that fits your needs and enroll today",
            buttonText: "Enroll Now",
            buttonLink: "/enroll",
          },
          variant: "centered",
          style: { padding: "large", backgroundColor: "#1e40af", textColor: "#ffffff" },
        },
      ]),
    },
    {
      title: "Contact",
      slug: "contact",
      sortOrder: 3,
      showInNav: true,
      sections: buildSections([
        {
          type: "hero",
          visible: true,
          content: {
            heading: "Contact {schoolName}",
            subheading: "We're here to answer your questions",
            buttonText: "",
            buttonLink: "",
            backgroundImage: "",
          },
          variant: "centered",
          style: { padding: "large", backgroundColor: "#1e3a5f", textColor: "#ffffff" },
        },
        {
          type: "contact",
          visible: true,
          content: {
            heading: "Get in Touch",
            showForm: true,
            showPhone: true,
            showEmail: true,
          },
          style: { padding: "large" },
        },
        {
          type: "locations",
          visible: true,
          content: { heading: "Our Locations" },
          style: { padding: "large" },
        },
        {
          type: "scheduler",
          visible: true,
          content: {
            heading: "Schedule a Free Consultation",
            description: "Pick a convenient date and time — we'll help you choose the right course",
            buttonText: "Book Consultation",
            bookingLink: "/enroll",
            daysToShow: 14,
            excludeDays: [0],
            timeSlots: ["9:00 AM", "10:00 AM", "11:00 AM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM"],
          },
          style: { padding: "large", backgroundColor: "#f8fafc", animation: "fade-in" },
        },
        {
          type: "google_reviews",
          visible: true,
          content: {
            heading: "What Our Students Say on Google",
            placeUrl: "",
            reviews: [
              { author: "Alex R.", rating: 5, text: "Outstanding driving school! The instructors are patient and truly care about your success.", date: "" },
              { author: "Jennifer T.", rating: 5, text: "My daughter passed her test on the first try thanks to the excellent training here.", date: "" },
              { author: "Carlos M.", rating: 5, text: "Flexible scheduling, professional instruction, and great value for the price.", date: "" },
              { author: "Sarah K.", rating: 4, text: "Very organized program. Would recommend to anyone looking for quality driver education.", date: "" },
            ],
          },
          style: { padding: "large", animation: "slide-up" },
        },
      ]),
    },
    {
      title: "FAQ",
      slug: "faq",
      sortOrder: 4,
      showInNav: true,
      sections: buildSections([
        {
          type: "hero",
          visible: true,
          content: {
            heading: "Frequently Asked Questions",
            subheading: "Everything you need to know about our driving courses",
            buttonText: "",
            buttonLink: "",
            backgroundImage: "",
          },
          variant: "centered",
          style: { padding: "large", backgroundColor: "#1e3a5f", textColor: "#ffffff" },
        },
        {
          type: "faq",
          visible: true,
          content: {
            heading: "Common Questions",
            items: [
              { question: "What age do I need to be to start?", answer: "Students must be at least 14 years old to begin the classroom portion and 15 years old for behind-the-wheel instruction in Texas." },
              { question: "How long does the course take?", answer: "Our teen program includes 32 hours of classroom instruction and 7-14 hours of behind-the-wheel training, typically completed in 4-6 weeks." },
              { question: "What documents do I need to enroll?", answer: "You'll need a valid learner's permit or ID, proof of identity, and a parent/guardian signature if you're under 18." },
              { question: "Do you offer pickup and drop-off for lessons?", answer: "Yes! We offer complimentary pickup and drop-off from home or school for behind-the-wheel lessons within our service area." },
              { question: "Is the course TDLR approved?", answer: "Absolutely. All of our courses are fully approved by the Texas Department of Licensing and Regulation (TDLR)." },
              { question: "What payment methods do you accept?", answer: "We accept credit/debit cards and offer payment plans for qualifying courses. Contact us for details." },
            ],
          },
          style: { padding: "large" },
        },
        {
          type: "cta",
          visible: true,
          content: {
            heading: "Still Have Questions?",
            subheading: "Our team is happy to help — reach out anytime",
            buttonText: "Contact Us",
            buttonLink: "/contact",
          },
          variant: "centered",
          style: { padding: "large", backgroundColor: "#1e40af", textColor: "#ffffff" },
        },
      ]),
    },
  ],
};

const cleanProfessional: WebsiteTemplate = {
  id: "clean-professional",
  name: "Clean & Professional",
  description: "Lots of whitespace, subtle shadows, muted palette, elegant and structured",
  previewColors: { primary: "#374151", accent: "#6366f1", bg: "#f9fafb" },
  pages: [
    {
      title: "Home",
      slug: "home",
      sortOrder: 0,
      showInNav: true,
      sections: buildSections([
        {
          type: "hero",
          visible: true,
          content: {
            heading: "Professional Driver Education at {schoolName}",
            subheading: "Trusted by families across Texas for quality instruction and proven results",
            buttonText: "Explore Programs",
            buttonLink: "/packages",
            backgroundImage: "",
          },
          variant: "split",
          style: { padding: "large", animation: "fade-in" },
        },
        {
          type: "features",
          visible: true,
          content: {
            heading: "Why Families Choose {schoolName}",
            items: [
              { title: "Licensed & Certified", description: "TDLR-approved school with fully credentialed instructors you can trust.", icon: "badge-check" },
              { title: "Comprehensive Curriculum", description: "Classroom theory, behind-the-wheel practice, and defensive driving techniques all covered.", icon: "book-open" },
              { title: "Personalized Attention", description: "Small class sizes and one-on-one driving lessons ensure every student gets focused instruction.", icon: "users" },
              { title: "Convenient Scheduling", description: "Online booking with morning, afternoon, evening, and weekend availability.", icon: "calendar" },
            ],
          },
          variant: "grid",
          style: { padding: "large", borderRadius: "md", shadow: "sm", animation: "slide-up" },
        },
        {
          type: "process",
          visible: true,
          content: {
            heading: "The Enrollment Process",
            description: "A clear, straightforward path from registration to certification",
            steps: [
              { title: "Apply Online", description: "Complete a brief application and select your preferred program.", icon: "clipboard-list" },
              { title: "Attend Orientation", description: "Meet your instructor and review the course plan.", icon: "users" },
              { title: "Complete Training", description: "Classroom instruction plus supervised driving hours.", icon: "book-open" },
              { title: "Earn Your Certificate", description: "Receive your official TDLR completion certificate.", icon: "award" },
            ],
          },
          variant: "vertical",
          style: { padding: "large", animation: "slide-up" },
        },
        {
          type: "text",
          visible: true,
          content: {
            heading: "A Tradition of Excellence",
            body: "<p>{schoolName} has been helping Texas drivers earn their licenses safely and confidently. Our structured programs are built around the latest TDLR guidelines, combining classroom learning with real-world practice.</p>",
            body2: "<p>Whether you're a teenager taking your first course or an adult refreshing your skills, we provide a supportive environment with clear instruction and measurable progress.</p>",
          },
          variant: "two-column",
          style: { padding: "large" },
        },
        {
          type: "testimonials",
          visible: true,
          content: {
            heading: "Student Experiences",
            items: [
              { name: "David P.", text: "The structured approach at {schoolName} really worked for me. Every lesson built on the previous one logically.", rating: 5, role: "Adult Learner" },
              { name: "Linda W.", text: "Professional, organized, and genuinely caring instructors. My son felt well-prepared for his test.", rating: 5, role: "Parent" },
              { name: "Ryan K.", text: "I appreciated the clear communication and consistent scheduling. No surprises, just solid instruction.", rating: 5, role: "Recent Graduate" },
            ],
          },
          variant: "default",
          style: { padding: "large", borderRadius: "md" },
        },
        {
          type: "cta",
          visible: true,
          content: {
            heading: "Begin Your Driver Education",
            subheading: "Join the families who trust {schoolName} for quality instruction",
            buttonText: "View Programs",
            buttonLink: "/packages",
          },
          variant: "centered",
          style: { padding: "large", backgroundColor: "#6366f1", textColor: "#ffffff" },
        },
      ]),
    },
    {
      title: "About Us",
      slug: "about",
      sortOrder: 1,
      showInNav: true,
      sections: buildSections([
        {
          type: "text",
          visible: true,
          title: "About {schoolName}",
          subtitle: "Quality education, experienced instruction, real results",
          content: {
            heading: "Our Story",
            body: "<p>{schoolName} was established to raise the standard of driver education in our community. We recognized that learning to drive is one of the most important skills a person can develop, and it deserves the highest quality instruction.</p><p>Our approach blends structured classroom learning with extensive behind-the-wheel practice. Every lesson is designed to build competence, awareness, and confidence — the three pillars of a safe driver.</p>",
          },
          variant: "default",
          style: { padding: "large" },
        },
        {
          type: "team",
          visible: true,
          content: {
            heading: "Our Instructors",
            members: [
              { name: "Head Instructor", role: "Program Director", bio: "Oversees all training programs with a focus on curriculum quality and student outcomes. TDLR-certified since 2010.", photo: "", certifications: "Texas TDLR Certified" },
              { name: "Driving Instructor", role: "Behind-the-Wheel Specialist", bio: "Specializes in building calm, confident drivers through patient, step-by-step instruction.", photo: "", certifications: "Texas TDLR Certified" },
            ],
          },
          variant: "grid",
          style: { padding: "large", borderRadius: "md", shadow: "sm" },
        },
        {
          type: "features",
          visible: true,
          content: {
            heading: "Our Commitment",
            items: [
              { title: "Safety First", description: "Every decision we make prioritizes the safety of our students.", icon: "shield" },
              { title: "Quality Instruction", description: "Continuous improvement of our methods and materials.", icon: "target" },
              { title: "Student Success", description: "Measured by pass rates, confidence, and lifelong safe driving.", icon: "trending-up" },
            ],
          },
          variant: "cards",
          style: { padding: "large", animation: "slide-up" },
        },
      ]),
    },
    {
      title: "Programs",
      slug: "packages",
      sortOrder: 2,
      showInNav: true,
      sections: buildSections([
        {
          type: "text",
          visible: true,
          title: "Our Programs",
          subtitle: "Comprehensive courses for teens and adults",
          content: {
            heading: "Driver Education Programs",
            body: "<p>Each program at {schoolName} is carefully designed to meet Texas TDLR requirements while providing thorough, practical training. Browse our offerings below and choose the right path for you.</p>",
          },
          variant: "default",
          style: { padding: "large" },
        },
        {
          type: "packages",
          visible: true,
          content: { heading: "Available Courses" },
          style: { padding: "large" },
        },
        {
          type: "faq",
          visible: true,
          content: {
            heading: "Course Questions",
            items: [
              { question: "Can I switch between courses?", answer: "Yes, upgrades are available. Contact us to discuss the best option for you." },
              { question: "Are payment plans available?", answer: "We offer flexible payment options on select courses. Ask us for details when you enroll." },
              { question: "What if I need to reschedule?", answer: "You can reschedule lessons with at least 24 hours' notice at no extra charge." },
            ],
          },
          style: { padding: "large" },
        },
      ]),
    },
    {
      title: "Contact",
      slug: "contact",
      sortOrder: 3,
      showInNav: true,
      sections: buildSections([
        {
          type: "text",
          visible: true,
          title: "Contact Us",
          content: {
            heading: "We'd Love to Hear From You",
            body: "<p>Have questions about our programs, scheduling, or enrollment? Our team is here to help. Reach out through the form below or contact us directly.</p>",
          },
          variant: "default",
          style: { padding: "large" },
        },
        {
          type: "contact",
          visible: true,
          content: {
            heading: "Send Us a Message",
            showForm: true,
            showPhone: true,
            showEmail: true,
          },
          style: { padding: "large", borderRadius: "md", shadow: "sm" },
        },
        {
          type: "locations",
          visible: true,
          content: { heading: "Visit Us" },
          style: { padding: "large" },
        },
      ]),
    },
    {
      title: "FAQ",
      slug: "faq",
      sortOrder: 4,
      showInNav: true,
      sections: buildSections([
        {
          type: "text",
          visible: true,
          title: "Frequently Asked Questions",
          content: {
            heading: "Answers to Common Questions",
            body: "<p>Find answers to the most common questions about our programs, requirements, and enrollment process below.</p>",
          },
          variant: "default",
          style: { padding: "medium" },
        },
        {
          type: "faq",
          visible: true,
          content: {
            heading: "General Questions",
            items: [
              { question: "What age can my child start?", answer: "Students can begin classroom instruction at age 14 and behind-the-wheel at age 15 in Texas." },
              { question: "How do I know if you're properly licensed?", answer: "{schoolName} is fully licensed and approved by the Texas Department of Licensing and Regulation (TDLR)." },
              { question: "What is included in the tuition?", answer: "Tuition covers all classroom instruction, behind-the-wheel hours, course materials, and your certificate of completion." },
              { question: "Do you provide vehicles for the driving test?", answer: "Yes, students may use our vehicles for their driving exam at no extra charge." },
              { question: "How do I schedule behind-the-wheel lessons?", answer: "After enrolling, you can schedule lessons through our online portal at your convenience." },
              { question: "What happens if the student fails the test?", answer: "We provide additional practice sessions to help the student prepare for a retake. Contact us for details." },
            ],
          },
          style: { padding: "large" },
        },
      ]),
    },
  ],
};

const warmFriendly: WebsiteTemplate = {
  id: "warm-friendly",
  name: "Warm & Friendly",
  description: "Rounded corners, warm tones, soft gradients, approachable and inviting feel",
  previewColors: { primary: "#ea580c", accent: "#f97316", bg: "#fff7ed" },
  pages: [
    {
      title: "Home",
      slug: "home",
      sortOrder: 0,
      showInNav: true,
      sections: buildSections([
        {
          type: "hero",
          visible: true,
          content: {
            heading: "Welcome to {schoolName}!",
            subheading: "Where learning to drive is fun, safe, and stress-free",
            buttonText: "Get Started",
            buttonLink: "/enroll",
            backgroundImage: "",
            gradientText: { from: "#ea580c", to: "#f97316" },
          },
          variant: "centered",
          style: { padding: "large", gradientFrom: "#fff7ed", gradientTo: "#fed7aa", gradientDirection: "to-bottom", borderRadius: "lg", animation: "fade-in" },
        },
        {
          type: "features",
          visible: true,
          content: {
            heading: "What Makes Us Special",
            items: [
              { title: "Patient Instructors", description: "Our team understands that everyone learns differently. We adapt to your pace and comfort level.", icon: "heart" },
              { title: "Fun Learning", description: "Driving education doesn't have to be boring. Our engaging lessons keep students motivated.", icon: "smile" },
              { title: "Family-Friendly", description: "We treat every student like family. Parents stay informed and involved throughout the process.", icon: "home" },
              { title: "TDLR Approved", description: "Fully licensed by the state of Texas — your certification is recognized everywhere.", icon: "file-check" },
            ],
          },
          variant: "cards",
          style: { padding: "large", borderRadius: "lg", shadow: "md", animation: "slide-up" },
        },
        {
          type: "packages",
          visible: true,
          content: { heading: "Our Courses" },
          style: { padding: "large", borderRadius: "lg" },
        },
        {
          type: "testimonials",
          visible: true,
          content: {
            heading: "Happy Students & Parents",
            items: [
              { name: "Sophia H.", text: "{schoolName} made learning to drive so much less intimidating! My instructor was incredibly patient and encouraging.", rating: 5 },
              { name: "Michael & Karen D.", text: "Both our kids learned to drive here. The staff knows every student by name — it's truly a family atmosphere.", rating: 5 },
              { name: "Priya S.", text: "I was anxious about driving, but the warm, supportive environment at {schoolName} helped me overcome my fears.", rating: 5 },
            ],
          },
          variant: "carousel",
          style: { padding: "large", borderRadius: "lg", backgroundColor: "#fff7ed" },
        },
        {
          type: "cta",
          visible: true,
          content: {
            heading: "Join the {schoolName} Family!",
            subheading: "We can't wait to help you or your teen hit the road with confidence",
            buttonText: "Sign Up Today",
            buttonLink: "/enroll",
          },
          variant: "centered",
          style: { padding: "large", backgroundColor: "#ea580c", textColor: "#ffffff", borderRadius: "lg" },
        },
      ]),
    },
    {
      title: "About Us",
      slug: "about",
      sortOrder: 1,
      showInNav: true,
      sections: buildSections([
        {
          type: "hero",
          visible: true,
          content: {
            heading: "Our Story",
            subheading: "A passion for teaching, a commitment to safety",
            buttonText: "",
            buttonLink: "",
            backgroundImage: "",
          },
          variant: "centered",
          style: { padding: "large", gradientFrom: "#fff7ed", gradientTo: "#fed7aa", gradientDirection: "to-bottom" },
        },
        {
          type: "text",
          visible: true,
          content: {
            heading: "Why We Do What We Do",
            body: "<p>At {schoolName}, we believe learning to drive should be an exciting milestone — not a stressful chore. That's why we've built a school that feels more like a community than a classroom.</p><p>Every instructor on our team was chosen not just for their skills behind the wheel, but for their warmth, patience, and genuine love of teaching. We know your family is trusting us with something important, and we don't take that lightly.</p>",
          },
          variant: "default",
          style: { padding: "large", borderRadius: "lg" },
        },
        {
          type: "team",
          visible: true,
          content: {
            heading: "Meet the Team",
            members: [
              { name: "Lead Instructor", role: "Founder & Head Instructor", bio: "Started the school with a simple belief: every student can become a great driver with the right guidance and encouragement.", photo: "", certifications: "Texas TDLR Certified" },
              { name: "Instructor", role: "Driving Coach", bio: "Known for a calm, reassuring teaching style that puts even the most nervous students at ease.", photo: "", certifications: "Texas TDLR Certified" },
            ],
          },
          variant: "grid",
          style: { padding: "large", borderRadius: "lg", shadow: "md" },
        },
      ]),
    },
    {
      title: "Courses",
      slug: "packages",
      sortOrder: 2,
      showInNav: true,
      sections: buildSections([
        {
          type: "hero",
          visible: true,
          content: {
            heading: "Find Your Perfect Course",
            subheading: "Something for every age and experience level",
            buttonText: "",
            buttonLink: "",
            backgroundImage: "",
          },
          variant: "centered",
          style: { padding: "large", gradientFrom: "#fff7ed", gradientTo: "#fed7aa", gradientDirection: "to-bottom" },
        },
        {
          type: "packages",
          visible: true,
          content: { heading: "Browse Courses" },
          style: { padding: "large", borderRadius: "lg" },
        },
        {
          type: "text",
          visible: true,
          content: {
            heading: "Not Sure Which Course?",
            body: "<p>Don't worry — we're here to help! Give us a call or send us a message, and we'll help you find the right program for your needs and schedule. No pressure, just friendly guidance.</p>",
          },
          variant: "default",
          style: { padding: "medium", borderRadius: "lg" },
        },
        {
          type: "cta",
          visible: true,
          content: {
            heading: "Let's Get You Enrolled!",
            subheading: "A friendly team is standing by to help you every step of the way",
            buttonText: "Start Now",
            buttonLink: "/enroll",
          },
          variant: "centered",
          style: { padding: "large", backgroundColor: "#ea580c", textColor: "#ffffff", borderRadius: "lg" },
        },
      ]),
    },
    {
      title: "Contact",
      slug: "contact",
      sortOrder: 3,
      showInNav: true,
      sections: buildSections([
        {
          type: "hero",
          visible: true,
          content: {
            heading: "Say Hello!",
            subheading: "We'd love to hear from you",
            buttonText: "",
            buttonLink: "",
            backgroundImage: "",
          },
          variant: "centered",
          style: { padding: "large", gradientFrom: "#fff7ed", gradientTo: "#fed7aa", gradientDirection: "to-bottom" },
        },
        {
          type: "contact",
          visible: true,
          content: {
            heading: "Reach Out Anytime",
            showForm: true,
            showPhone: true,
            showEmail: true,
          },
          style: { padding: "large", borderRadius: "lg", shadow: "md" },
        },
        {
          type: "locations",
          visible: true,
          content: { heading: "Come Visit Us" },
          style: { padding: "large", borderRadius: "lg" },
        },
      ]),
    },
    {
      title: "FAQ",
      slug: "faq",
      sortOrder: 4,
      showInNav: true,
      sections: buildSections([
        {
          type: "hero",
          visible: true,
          content: {
            heading: "Got Questions?",
            subheading: "We've got answers — here are the ones we hear most often",
            buttonText: "",
            buttonLink: "",
            backgroundImage: "",
          },
          variant: "centered",
          style: { padding: "large", gradientFrom: "#fff7ed", gradientTo: "#fed7aa", gradientDirection: "to-bottom" },
        },
        {
          type: "faq",
          visible: true,
          content: {
            heading: "Frequently Asked Questions",
            items: [
              { question: "Is this course right for my teenager?", answer: "If your teen is at least 14, absolutely! Our teen program is designed specifically for young learners with age-appropriate instruction." },
              { question: "What if my child is nervous about driving?", answer: "That's completely normal! Our instructors are experts at building confidence gradually. We never rush a student." },
              { question: "Can I sit in on a classroom session?", answer: "We welcome parents to observe a classroom session. Contact us to arrange a visit." },
              { question: "Are your instructors background-checked?", answer: "Yes. Every instructor passes a thorough background check and holds current TDLR certification." },
              { question: "What forms of payment do you accept?", answer: "We accept all major credit cards and offer payment plans on select courses." },
              { question: "Can we pick lesson times?", answer: "Yes! We offer flexible scheduling so you can choose mornings, afternoons, evenings, or weekends." },
            ],
          },
          style: { padding: "large", borderRadius: "lg" },
        },
        {
          type: "cta",
          visible: true,
          content: {
            heading: "Still Curious?",
            subheading: "Call or message us — no question is too small!",
            buttonText: "Contact Us",
            buttonLink: "/contact",
          },
          variant: "centered",
          style: { padding: "large", backgroundColor: "#ea580c", textColor: "#ffffff", borderRadius: "lg" },
        },
      ]),
    },
  ],
};

const dynamicEnergetic: WebsiteTemplate = {
  id: "dynamic-energetic",
  name: "Dynamic & Energetic",
  description: "Vibrant gradients, angled dividers, energetic CTAs, high contrast",
  previewColors: { primary: "#7c3aed", accent: "#06b6d4", bg: "#0f172a" },
  pages: [
    {
      title: "Home",
      slug: "home",
      sortOrder: 0,
      showInNav: true,
      sections: buildSections([
        {
          type: "hero",
          visible: true,
          content: {
            heading: "Your License Is Closer Than You Think",
            subheading: "{schoolName} — fast-track your driving skills with Texas's most energetic driving school",
            buttonText: "Let's Go!",
            buttonLink: "/enroll",
            backgroundImage: "",
          },
          variant: "centered",
          style: { padding: "large", gradientFrom: "#7c3aed", gradientTo: "#06b6d4", gradientDirection: "to-bottom-right", textColor: "#ffffff", animation: "fade-in", dividerShape: "wave" },
        },
        {
          type: "stats",
          visible: true,
          content: {
            heading: "Results That Speak",
            items: [
              { value: "1,500+", label: "Licenses Earned", icon: "trophy" },
              { value: "97%", label: "First-Try Pass Rate", icon: "target" },
              { value: "10+", label: "Years Running", icon: "zap" },
              { value: "5.0", label: "Google Reviews", icon: "star" },
            ],
          },
          style: { padding: "medium", backgroundColor: "#06b6d4", textColor: "#ffffff", animation: "slide-up" },
        },
        {
          type: "features",
          visible: true,
          content: {
            heading: "Why {schoolName} Hits Different",
            items: [
              { title: "High-Energy Classes", description: "No boring lectures here — our classroom sessions are interactive, engaging, and packed with real scenarios.", icon: "zap" },
              { title: "Modern Training Fleet", description: "Sleek, up-to-date vehicles with the latest safety features. You'll train in what you'll actually drive.", icon: "car" },
              { title: "Fast & Flexible", description: "Accelerated schedules available. Get licensed faster without cutting corners on quality.", icon: "clock" },
            ],
          },
          variant: "cards",
          style: { padding: "large", borderRadius: "md", shadow: "lg", animation: "slide-left" },
        },
        {
          type: "packages",
          visible: true,
          content: { heading: "Pick Your Path" },
          style: { padding: "large" },
        },
        {
          type: "testimonials",
          visible: true,
          content: {
            heading: "Student Wins",
            items: [
              { name: "Tyler B.", text: "Honestly didn't think I'd enjoy driver's ed, but {schoolName} made it actually fun. Passed on the first attempt!", rating: 5 },
              { name: "Aisha N.", text: "The vibe is so different from other schools. Energetic instructors, modern cars, and a system that actually works.", rating: 5 },
              { name: "Marcus J.", text: "Got my license in record time thanks to their accelerated program. Highly recommend!", rating: 5 },
            ],
          },
          variant: "carousel",
          style: { padding: "large", animation: "slide-right" },
        },
        {
          type: "cta",
          visible: true,
          content: {
            heading: "Stop Waiting. Start Driving.",
            subheading: "Your license is just a course away. Let's make it happen.",
            buttonText: "Enroll Now",
            buttonLink: "/enroll",
          },
          variant: "centered",
          style: { padding: "large", gradientFrom: "#7c3aed", gradientTo: "#06b6d4", gradientDirection: "to-bottom-right", textColor: "#ffffff", dividerShape: "angle" },
        },
      ]),
    },
    {
      title: "About",
      slug: "about",
      sortOrder: 1,
      showInNav: true,
      sections: buildSections([
        {
          type: "hero",
          visible: true,
          content: {
            heading: "The {schoolName} Story",
            subheading: "Born from a passion for driving — built for the next generation",
            buttonText: "",
            buttonLink: "",
            backgroundImage: "",
          },
          variant: "centered",
          style: { padding: "large", gradientFrom: "#7c3aed", gradientTo: "#06b6d4", gradientDirection: "to-bottom-right", textColor: "#ffffff" },
        },
        {
          type: "text",
          visible: true,
          content: {
            heading: "We're Not Your Average Driving School",
            body: "<p>{schoolName} was created because we believed driving education could be better — more engaging, more modern, and more effective. We threw out the dusty textbooks and built something fresh.</p><p>Our approach combines interactive classroom experiences with intensive behind-the-wheel training. Every lesson is designed to be memorable, practical, and empowering.</p>",
          },
          variant: "default",
          style: { padding: "large", animation: "slide-up" },
        },
        {
          type: "team",
          visible: true,
          content: {
            heading: "The Crew",
            members: [
              { name: "Lead Instructor", role: "Founder & Chief Instructor", bio: "Built {schoolName} from the ground up with one goal: make learning to drive an experience students actually enjoy.", photo: "", certifications: "Texas TDLR Certified" },
              { name: "Driving Coach", role: "Senior Instructor", bio: "High-energy instructor who makes every lesson count. Expert in highway driving and defensive maneuvers.", photo: "", certifications: "Texas TDLR Certified" },
            ],
          },
          variant: "grid",
          style: { padding: "large", borderRadius: "md", shadow: "lg", animation: "slide-up" },
        },
      ]),
    },
    {
      title: "Programs",
      slug: "packages",
      sortOrder: 2,
      showInNav: true,
      sections: buildSections([
        {
          type: "hero",
          visible: true,
          content: {
            heading: "Choose Your Course",
            subheading: "Programs designed to get you road-ready, fast",
            buttonText: "",
            buttonLink: "",
            backgroundImage: "",
          },
          variant: "centered",
          style: { padding: "large", gradientFrom: "#7c3aed", gradientTo: "#06b6d4", gradientDirection: "to-bottom-right", textColor: "#ffffff" },
        },
        {
          type: "packages",
          visible: true,
          content: { heading: "Available Programs" },
          style: { padding: "large" },
        },
        {
          type: "features",
          visible: true,
          content: {
            heading: "What's Included",
            items: [
              { title: "All Course Materials", description: "Everything you need is provided — no extra purchases required.", icon: "package" },
              { title: "Practice Tests", description: "Online practice exams to make sure you're fully prepared.", icon: "clipboard-check" },
              { title: "Completion Certificate", description: "Official TDLR certificate issued immediately upon completion.", icon: "award" },
            ],
          },
          variant: "cards",
          style: { padding: "large", animation: "slide-up" },
        },
        {
          type: "cta",
          visible: true,
          content: {
            heading: "Ready to Roll?",
            subheading: "Pick your program and get started today",
            buttonText: "Enroll Now",
            buttonLink: "/enroll",
          },
          variant: "centered",
          style: { padding: "large", gradientFrom: "#7c3aed", gradientTo: "#06b6d4", gradientDirection: "to-bottom-right", textColor: "#ffffff" },
        },
      ]),
    },
    {
      title: "Contact",
      slug: "contact",
      sortOrder: 3,
      showInNav: true,
      sections: buildSections([
        {
          type: "hero",
          visible: true,
          content: {
            heading: "Hit Us Up",
            subheading: "Questions? We're all ears",
            buttonText: "",
            buttonLink: "",
            backgroundImage: "",
          },
          variant: "centered",
          style: { padding: "large", gradientFrom: "#7c3aed", gradientTo: "#06b6d4", gradientDirection: "to-bottom-right", textColor: "#ffffff" },
        },
        {
          type: "contact",
          visible: true,
          content: {
            heading: "Get in Touch",
            showForm: true,
            showPhone: true,
            showEmail: true,
          },
          style: { padding: "large", borderRadius: "md", shadow: "lg" },
        },
        {
          type: "locations",
          visible: true,
          content: { heading: "Find Us" },
          style: { padding: "large" },
        },
      ]),
    },
    {
      title: "FAQ",
      slug: "faq",
      sortOrder: 4,
      showInNav: true,
      sections: buildSections([
        {
          type: "hero",
          visible: true,
          content: {
            heading: "FAQs",
            subheading: "Quick answers to the stuff everyone asks",
            buttonText: "",
            buttonLink: "",
            backgroundImage: "",
          },
          variant: "centered",
          style: { padding: "large", gradientFrom: "#7c3aed", gradientTo: "#06b6d4", gradientDirection: "to-bottom-right", textColor: "#ffffff" },
        },
        {
          type: "faq",
          visible: true,
          content: {
            heading: "Frequently Asked Questions",
            items: [
              { question: "How fast can I get my license?", answer: "With our accelerated program, eligible students can complete the course in as little as 2-3 weeks." },
              { question: "Do I need a permit first?", answer: "A learner's permit is required for behind-the-wheel lessons, but you can start classroom instruction while you wait." },
              { question: "What kind of cars do you use?", answer: "We use late-model sedans and SUVs equipped with dual braking systems and the latest safety technology." },
              { question: "Can I take lessons on weekends?", answer: "Absolutely! We have full availability on Saturdays and Sundays." },
              { question: "Are online classes available?", answer: "Yes, we offer online classroom options where allowed by TDLR regulations." },
              { question: "What's your cancellation policy?", answer: "Reschedule or cancel with 24 hours' notice for no charge. Late cancellations may incur a small fee." },
            ],
          },
          style: { padding: "large" },
        },
        {
          type: "cta",
          visible: true,
          content: {
            heading: "Didn't Find Your Answer?",
            subheading: "Drop us a line — we respond fast",
            buttonText: "Contact Us",
            buttonLink: "/contact",
          },
          variant: "centered",
          style: { padding: "large", gradientFrom: "#7c3aed", gradientTo: "#06b6d4", gradientDirection: "to-bottom-right", textColor: "#ffffff" },
        },
      ]),
    },
  ],
};

const classicTrustworthy: WebsiteTemplate = {
  id: "classic-trustworthy",
  name: "Classic & Trustworthy",
  description: "Traditional structured layout, navy and gold palette, formal authoritative tone",
  previewColors: { primary: "#1e3a5f", accent: "#d4a017", bg: "#fafaf5" },
  pages: [
    {
      title: "Home",
      slug: "home",
      sortOrder: 0,
      showInNav: true,
      sections: buildSections([
        {
          type: "hero",
          visible: true,
          content: {
            heading: "{schoolName} — Trusted Driver Education Since Day One",
            subheading: "Texas TDLR-approved programs built on experience, integrity, and proven results",
            buttonText: "View Our Programs",
            buttonLink: "/packages",
            backgroundImage: "",
          },
          variant: "split",
          style: { padding: "large", backgroundColor: "#1e3a5f", textColor: "#ffffff", animation: "fade-in" },
        },
        {
          type: "features",
          visible: true,
          content: {
            heading: "The {schoolName} Standard",
            items: [
              { title: "Experience You Can Trust", description: "Years of proven results and thousands of successful graduates speak for themselves.", icon: "award" },
              { title: "Rigorous Standards", description: "Our curriculum exceeds TDLR minimums, preparing students for real-world driving challenges.", icon: "clipboard-check" },
              { title: "Professional Instructors", description: "Every instructor undergoes continuous training to maintain the highest teaching standards.", icon: "graduation-cap" },
              { title: "Safety Record", description: "An impeccable safety record reflects our commitment to responsible driver education.", icon: "shield" },
            ],
          },
          variant: "grid",
          style: { padding: "large", animation: "slide-up" },
        },
        {
          type: "packages",
          visible: true,
          content: { heading: "Our Programs" },
          style: { padding: "large" },
        },
        {
          type: "stats",
          visible: true,
          content: {
            heading: "Our Legacy in Numbers",
            items: [
              { value: "3,000+", label: "Graduates", icon: "users" },
              { value: "20+", label: "Years Serving Texas", icon: "calendar" },
              { value: "99%", label: "Pass Rate", icon: "check-circle" },
              { value: "A+", label: "BBB Rating", icon: "award" },
            ],
          },
          style: { padding: "medium", backgroundColor: "#1e3a5f", textColor: "#ffffff" },
        },
        {
          type: "testimonials",
          visible: true,
          content: {
            heading: "Testimonials",
            items: [
              { name: "Robert S.", text: "{schoolName} provided thorough, professional instruction. I felt fully prepared for my driving exam and passed with ease.", rating: 5 },
              { name: "Catherine L.", text: "As a parent, safety was my top priority. {schoolName} exceeded every expectation I had for my son's driver education.", rating: 5 },
              { name: "Thomas W.", text: "The level of professionalism at {schoolName} is unmatched. I would recommend them to anyone without hesitation.", rating: 5 },
            ],
          },
          variant: "default",
          style: { padding: "large" },
        },
        {
          type: "cta",
          visible: true,
          content: {
            heading: "Enroll With Confidence",
            subheading: "Experience the standard in Texas driver education",
            buttonText: "Get Started",
            buttonLink: "/enroll",
          },
          variant: "centered",
          style: { padding: "large", backgroundColor: "#d4a017", textColor: "#1e3a5f" },
        },
      ]),
    },
    {
      title: "About Us",
      slug: "about",
      sortOrder: 1,
      showInNav: true,
      sections: buildSections([
        {
          type: "hero",
          visible: true,
          content: {
            heading: "About {schoolName}",
            subheading: "A legacy of safe driving excellence in Texas",
            buttonText: "",
            buttonLink: "",
            backgroundImage: "",
          },
          variant: "centered",
          style: { padding: "large", backgroundColor: "#1e3a5f", textColor: "#ffffff" },
        },
        {
          type: "text",
          visible: true,
          content: {
            heading: "Our History",
            body: "<p>{schoolName} has served the Texas community with distinction, providing driver education that emphasizes safety, responsibility, and skill. Our programs are designed to not just meet state requirements, but to genuinely prepare drivers for a lifetime of safe travel.</p>",
            body2: "<p>We hold ourselves to the highest standards of professionalism and instruction quality. Our reputation is built on trust — earned through every student we train, every family we serve, and every safe driver we put on the road.</p>",
          },
          variant: "two-column",
          style: { padding: "large" },
        },
        {
          type: "team",
          visible: true,
          content: {
            heading: "Our Instructor Team",
            members: [
              { name: "Director of Instruction", role: "School Director", bio: "Brings decades of experience in driver education and school administration. Committed to maintaining the highest training standards.", photo: "", certifications: "Texas TDLR Certified, Defensive Driving Specialist" },
              { name: "Senior Instructor", role: "Lead Instructor", bio: "Recognized for excellence in behind-the-wheel training with a methodical, safety-first approach.", photo: "", certifications: "Texas TDLR Certified" },
            ],
          },
          variant: "grid",
          style: { padding: "large" },
        },
      ]),
    },
    {
      title: "Programs",
      slug: "packages",
      sortOrder: 2,
      showInNav: true,
      sections: buildSections([
        {
          type: "hero",
          visible: true,
          content: {
            heading: "Our Programs",
            subheading: "Comprehensive TDLR-approved courses for all ages",
            buttonText: "",
            buttonLink: "",
            backgroundImage: "",
          },
          variant: "centered",
          style: { padding: "large", backgroundColor: "#1e3a5f", textColor: "#ffffff" },
        },
        {
          type: "packages",
          visible: true,
          content: { heading: "Course Offerings" },
          style: { padding: "large" },
        },
        {
          type: "features",
          visible: true,
          content: {
            heading: "Program Standards",
            items: [
              { title: "TDLR-Approved Curriculum", description: "Meets and exceeds all Texas regulatory requirements.", icon: "file-check" },
              { title: "Certificate of Completion", description: "Official state-recognized certification upon graduation.", icon: "award" },
              { title: "Insurance Discount Eligible", description: "Completion may qualify students for auto insurance discounts.", icon: "dollar-sign" },
            ],
          },
          variant: "cards",
          style: { padding: "large" },
        },
        {
          type: "cta",
          visible: true,
          content: {
            heading: "Ready to Enroll?",
            subheading: "Take the first step toward safe, confident driving",
            buttonText: "Enroll Now",
            buttonLink: "/enroll",
          },
          variant: "centered",
          style: { padding: "large", backgroundColor: "#d4a017", textColor: "#1e3a5f" },
        },
      ]),
    },
    {
      title: "Contact",
      slug: "contact",
      sortOrder: 3,
      showInNav: true,
      sections: buildSections([
        {
          type: "hero",
          visible: true,
          content: {
            heading: "Contact {schoolName}",
            subheading: "We welcome your inquiries",
            buttonText: "",
            buttonLink: "",
            backgroundImage: "",
          },
          variant: "centered",
          style: { padding: "large", backgroundColor: "#1e3a5f", textColor: "#ffffff" },
        },
        {
          type: "contact",
          visible: true,
          content: {
            heading: "Get in Touch",
            showForm: true,
            showPhone: true,
            showEmail: true,
          },
          style: { padding: "large" },
        },
        {
          type: "locations",
          visible: true,
          content: { heading: "Our Locations" },
          style: { padding: "large" },
        },
      ]),
    },
    {
      title: "FAQ",
      slug: "faq",
      sortOrder: 4,
      showInNav: true,
      sections: buildSections([
        {
          type: "hero",
          visible: true,
          content: {
            heading: "Frequently Asked Questions",
            subheading: "Answers to commonly asked questions about our programs",
            buttonText: "",
            buttonLink: "",
            backgroundImage: "",
          },
          variant: "centered",
          style: { padding: "large", backgroundColor: "#1e3a5f", textColor: "#ffffff" },
        },
        {
          type: "faq",
          visible: true,
          content: {
            heading: "Program & Enrollment Questions",
            items: [
              { question: "Is {schoolName} accredited by TDLR?", answer: "Yes. {schoolName} is fully licensed and approved by the Texas Department of Licensing and Regulation." },
              { question: "What age requirements apply?", answer: "Classroom instruction begins at age 14. Behind-the-wheel training requires the student to be at least 15 with a valid learner's permit." },
              { question: "How long is the full program?", answer: "The complete teen course typically takes 4-6 weeks, including 32 hours of classroom instruction and behind-the-wheel hours." },
              { question: "Do you provide a car for the driving test?", answer: "Yes, we provide a vehicle for your state driving examination at no additional cost." },
              { question: "Will this course help reduce insurance rates?", answer: "Many insurance providers offer discounts for students who complete an approved driver education course." },
              { question: "What is your refund policy?", answer: "Please contact our office for details regarding our refund and cancellation policies." },
            ],
          },
          style: { padding: "large" },
        },
      ]),
    },
  ],
};

const sleekMinimal: WebsiteTemplate = {
  id: "sleek-minimal",
  name: "Sleek & Minimal",
  description: "Sharp lines, modern typography, minimal decoration, dark-mode-friendly aesthetic",
  previewColors: { primary: "#18181b", accent: "#22d3ee", bg: "#09090b" },
  pages: [
    {
      title: "Home",
      slug: "home",
      sortOrder: 0,
      showInNav: true,
      sections: buildSections([
        {
          type: "hero",
          visible: true,
          content: {
            heading: "{schoolName}",
            subheading: "Expert driver education. No fluff. Just results.",
            buttonText: "See Programs",
            buttonLink: "/packages",
            backgroundImage: "",
          },
          variant: "centered",
          style: { padding: "large", backgroundColor: "#18181b", textColor: "#fafafa", animation: "fade-in" },
        },
        {
          type: "text",
          visible: true,
          content: {
            heading: "Simply Better Driver Ed",
            body: "<p>At {schoolName}, we cut through the noise. Our TDLR-approved courses deliver focused, effective training that prepares you for real-world driving — nothing more, nothing less.</p>",
          },
          variant: "default",
          style: { padding: "large" },
        },
        {
          type: "features",
          visible: true,
          content: {
            heading: "What We Offer",
            items: [
              { title: "Certified Instruction", description: "TDLR-approved instructors with years of experience.", icon: "shield" },
              { title: "Flexible Booking", description: "Schedule lessons when it works for you.", icon: "calendar" },
              { title: "Modern Vehicles", description: "Clean, well-maintained fleet with dual controls.", icon: "car" },
            ],
          },
          variant: "cards",
          style: { padding: "large", borderRadius: "sm", animation: "slide-up" },
        },
        {
          type: "packages",
          visible: true,
          content: { heading: "Programs" },
          style: { padding: "large" },
        },
        {
          type: "testimonials",
          visible: true,
          content: {
            heading: "Reviews",
            items: [
              { name: "Sam P.", text: "Clean, professional, efficient. Exactly what I wanted from a driving school.", rating: 5 },
              { name: "Wei L.", text: "No wasted time — every lesson had a clear purpose. Got my license in three weeks.", rating: 5 },
              { name: "Nadia K.", text: "The minimalist approach worked perfectly for me. Focused instruction, real skills, great result.", rating: 5 },
            ],
          },
          variant: "default",
          style: { padding: "large" },
        },
        {
          type: "cta",
          visible: true,
          content: {
            heading: "Get Started",
            subheading: "Enroll today — it's straightforward and fast",
            buttonText: "Enroll",
            buttonLink: "/enroll",
          },
          variant: "centered",
          style: { padding: "large", backgroundColor: "#18181b", textColor: "#fafafa" },
        },
      ]),
    },
    {
      title: "About",
      slug: "about",
      sortOrder: 1,
      showInNav: true,
      sections: buildSections([
        {
          type: "text",
          visible: true,
          title: "About",
          content: {
            heading: "Who We Are",
            body: "<p>{schoolName} exists to make driver education simple and effective. We focus on what matters: safety, skill, and confidence behind the wheel.</p><p>No gimmicks, no fluff — just structured instruction from experienced professionals who take their craft seriously.</p>",
          },
          variant: "default",
          style: { padding: "large" },
        },
        {
          type: "team",
          visible: true,
          content: {
            heading: "Instructors",
            members: [
              { name: "Instructor", role: "Lead Instructor", bio: "Focused on building competent, confident drivers through clear, structured lessons.", photo: "", certifications: "Texas TDLR Certified" },
              { name: "Instructor", role: "Driving Instructor", bio: "Specializes in efficient, focused behind-the-wheel training.", photo: "", certifications: "Texas TDLR Certified" },
            ],
          },
          variant: "grid",
          style: { padding: "large" },
        },
      ]),
    },
    {
      title: "Programs",
      slug: "packages",
      sortOrder: 2,
      showInNav: true,
      sections: buildSections([
        {
          type: "text",
          visible: true,
          title: "Programs",
          content: {
            heading: "Our Courses",
            body: "<p>Each course is designed for efficiency and effectiveness. Choose the program that fits your needs.</p>",
          },
          variant: "default",
          style: { padding: "medium" },
        },
        {
          type: "packages",
          visible: true,
          content: { heading: "Available Courses" },
          style: { padding: "large" },
        },
        {
          type: "cta",
          visible: true,
          content: {
            heading: "Ready?",
            subheading: "Choose your course and enroll in minutes",
            buttonText: "Enroll",
            buttonLink: "/enroll",
          },
          variant: "centered",
          style: { padding: "medium", backgroundColor: "#18181b", textColor: "#fafafa" },
        },
      ]),
    },
    {
      title: "Contact",
      slug: "contact",
      sortOrder: 3,
      showInNav: true,
      sections: buildSections([
        {
          type: "text",
          visible: true,
          title: "Contact",
          content: {
            heading: "Reach Out",
            body: "<p>Questions? Send us a message or give us a call.</p>",
          },
          variant: "default",
          style: { padding: "medium" },
        },
        {
          type: "contact",
          visible: true,
          content: {
            heading: "Contact Form",
            showForm: true,
            showPhone: true,
            showEmail: true,
          },
          style: { padding: "large" },
        },
        {
          type: "locations",
          visible: true,
          content: { heading: "Location" },
          style: { padding: "large" },
        },
      ]),
    },
    {
      title: "FAQ",
      slug: "faq",
      sortOrder: 4,
      showInNav: true,
      sections: buildSections([
        {
          type: "text",
          visible: true,
          title: "FAQ",
          content: {
            heading: "Common Questions",
            body: "<p>Answers to the questions we hear most.</p>",
          },
          variant: "default",
          style: { padding: "medium" },
        },
        {
          type: "faq",
          visible: true,
          content: {
            heading: "Questions & Answers",
            items: [
              { question: "What do I need to get started?", answer: "A learner's permit for behind-the-wheel lessons, or just sign up for classroom instruction to begin." },
              { question: "How long is the program?", answer: "Teen courses run 4-6 weeks. Adult courses are shorter. See our Programs page for details." },
              { question: "Is the course TDLR approved?", answer: "Yes. Fully approved by the Texas Department of Licensing and Regulation." },
              { question: "Can I schedule lessons online?", answer: "Yes. Our online portal makes scheduling fast and easy." },
              { question: "What vehicles do you use?", answer: "Late-model vehicles with dual-control braking systems." },
              { question: "What's the cancellation policy?", answer: "24-hour notice required for free rescheduling." },
            ],
          },
          style: { padding: "large" },
        },
      ]),
    },
  ],
};

export const websiteTemplates: WebsiteTemplate[] = [
  modernBold,
  cleanProfessional,
  warmFriendly,
  dynamicEnergetic,
  classicTrustworthy,
  sleekMinimal,
];

export function getRandomTemplate(): WebsiteTemplate {
  const index = Math.floor(Math.random() * websiteTemplates.length);
  return websiteTemplates[index];
}

export function getTemplateById(id: string): WebsiteTemplate | undefined {
  return websiteTemplates.find((t) => t.id === id);
}
