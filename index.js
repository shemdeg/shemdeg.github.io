/* === MAIN APP SCRIPT === */

// Wrap the entire script in an IIFE to avoid polluting the global scope
(function () {
  /* === UTILITIES === */
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  const el = (t, p = {}, kids = []) => {
    const e = document.createElement(t);
    Object.assign(e, p);
    kids.forEach(k => e.append(k));
    return e;
  };

  function setCookie(name, value, days) {
    let expires = "";
    if (days) {
      const date = new Date();
      date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
      expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "") + expires + "; path=/";
  }

  function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === ' ') c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
  }

  /* === CONSTANTS & STATE === */
  const state = {
    user: null,
    catalog: [],
    selected: [],
    cache: {},
    weekDates: [],
    userDays: {},
    userThemeName: null,
    lectureDuration: "03:00",
    mySubjectCarouselIndex: 0,
    quizCompletion: {},
    currentWeekData: null,
    selectedWeekNumber: null,
    db: null,
    auth: null,
    nextUpdateTimeout: null,
    userListener: null, // To store the unsubscribe function for the real-time listener
  };

  const daysOfWeek = ["ორშაბათი", "სამშაბათი", "ოთხშაბათი", "ხუთშაბათი", "პარასკევი", "შაბათი"];
  const dayAbbreviations = ["ორშ", "სამ", "ოთხ", "ხუთ", "პარ", "შაბ"];
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const isBetween = (d, s, e) => d >= s && d <= e;

  const SEMESTER_WEEKS = [
    { n: 1, start1: "2025-09-22", end1: "2025-09-28", start2: "2026-03-02", end2: "2026-03-08" },
    { n: 2, start1: "2025-09-29", end1: "2025-10-05", start2: "2026-03-09", end2: "2026-03-15" },
    { n: 3, start1: "2025-10-06", end1: "2025-10-12", start2: "2026-03-16", end2: "2026-03-22" },
    { n: 4, start1: "2025-10-13", end1: "2025-10-19", start2: "2026-03-23", end2: "2026-03-29" },
    { n: 5, start1: "2025-10-20", end1: "2025-10-26", start2: "2026-03-30", end2: "2026-04-05" },
    { n: 6, start1: "2025-10-27", end1: "2025-11-02", start2: "2026-04-06", end2: "2026-04-12" },
    { n: 7, start1: "2025-11-03", end1: "2025-11-09", start2: "2026-04-20", end2: "2026-04-26" },
    { n: 8, start1: "2025-11-10", end1: "2025-11-16", start2: "2026-04-27", end2: "2026-05-03" },
    { n: 9, start1: "2025-11-17", end1: "2025-11-23", start2: "2026-05-04", end2: "2026-05-10" },
    { n: 10, start1: "2025-11-24", end1: "2025-11-30", start2: "2026-05-11", end2: "2026-05-17" },
    { n: 11, start1: "2025-12-01", end1: "2025-12-07", start2: "2026-05-18", end2: "2026-05-24" },
    { n: 12, start1: "2025-12-08", end1: "2025-12-14", start2: "2026-05-25", end2: "2026-05-31" },
    { n: 13, start1: "2025-12-15", end1: "2025-12-20", start2: "2026-06-01", end2: "2026-06-06" }
  ];

  const THEMES = {
    "Default": { bg: "#121212", widget: "#1E1E1E", text: "#fff", accent: "#fff", accentVariant: "#fff", textOnAccent: "#000000" },    
    "Earth": { bg: "#121212", widget: "#1E1E1E", text: "#fff", accent: "#ff5100ff", accentVariant: "#ff4c2dff", textOnAccent: "#FFFFFF" },
    "SciFi": { bg: "#0A0F1E", widget: "#1A243D", text: "#E0E8FF", accent: "#00D1FF", accentVariant: "#007B9A", textOnAccent: "#000000" },
    "Green": { bg: "#121212", widget: "#1E1E1E", text: "#fff", accent: "#28b92dff", accentVariant: "rgba(79, 194, 84, 1)ff", textOnAccent: "#ffffffff" },
    "Blue": { bg: "#121212", widget: "#1E1E1E", text: "#fff", accent: "#2196F3", accentVariant: "#42A5F5", textOnAccent: "#FFFFFF" },
    "Light": { bg: "#F7F7F7", widget: "#FFFFFF", text: "#000000", accent: "#000000", accentVariant: "#333333", textOnAccent: "#FFFFFF" },
    "Latte": { bg: "#ffe3d3", widget: "#fff8f3", text: "#422D24", accent: "#ac5a3a", accentVariant: "#5D4037", textOnAccent: "#FFFFFF" },
  };

  /* === DATA & API FUNCTIONS === */

  function applyTheme(themeName) {
    const theme = THEMES[themeName] || THEMES["Default"];
    const root = document.documentElement;
    root.style.setProperty('--bg-color', theme.bg);
    root.style.setProperty('--widget-color', theme.widget);
    root.style.setProperty('--text-color', theme.text);
    root.style.setProperty('--accent-color', theme.accent);
    root.style.setProperty('--accent-variant-color', theme.accentVariant);
    root.style.setProperty('--text-on-accent-color', theme.textOnAccent);
    state.userThemeName = themeName;
  }

  async function saveTheme(themeName) { // This function is for theme only
    applyTheme(themeName);
    if (state.user) {
      await state.db.collection("users").doc(state.user.uid).set({ userThemeName: themeName }, { merge: true });
    }
    setCookie('userThemeName', themeName, 365);
  }

  async function saveQuizStatus(subjectId, weekNumber, isCompleted) {
    const key = `${subjectId}_${weekNumber}`;
    state.quizCompletion[key] = isCompleted;
    if (state.user) {
      await state.db.collection("users").doc(state.user.uid).set({ quizCompletion: state.quizCompletion }, { merge: true });
    }
    setCookie('quizCompletion', JSON.stringify(state.quizCompletion), 365);
  }

  function autoSave() {
    clearTimeout(state.saveTimeout);
    state.saveTimeout = setTimeout(saveSettings, 1200); // Debounce saves by 1.2 seconds
  }

  async function saveSettings() { // This now handles subjects and duration
    if (state.user) {
      await state.db.collection("users").doc(state.user.uid).set({
        subjects: state.selected,
        days: state.userDays,
        lectureDuration: state.lectureDuration
      }, { merge: true });
    }
    setCookie('selectedSubjects', JSON.stringify(state.selected), 365);
    setCookie('userDays', JSON.stringify(state.userDays), 365);
    setCookie('lectureDuration', state.lectureDuration, 365);

    // Re-render pages to reflect changes without a full reload
    // No need to re-render here if logged in; the listener will handle it.
    // If not logged in, we need to manually re-render.
    if (!state.user) {
      bootAfterDataLoad();
    }
    console.log("Settings auto-saved.");
  }

  function loadDataFromCookies() {
    return {
      selected: JSON.parse(getCookie('selectedSubjects') || '[]'),
      userDays: JSON.parse(getCookie('userDays') || '{}'),
      userThemeName: getCookie('userThemeName') || "Default",
      lectureDuration: getCookie('lectureDuration') || "03:00",
      quizCompletion: JSON.parse(getCookie('quizCompletion') || '{}'),
      cache: JSON.parse(getCookie('customSubjects') || '{}') // Also load custom subjects from cookies
    };
  }

  async function loadData() {
    // Detach any existing listener to prevent memory leaks on re-login
    if (state.userListener) {
      state.userListener();
      state.userListener = null;
    }
  
    // Load public catalog once
    try {
      const catalogSnap = await state.db.collection("subjects").get();
      state.catalog = catalogSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (error) {
      console.error("Failed to load public subject catalog:", error);
    }
  
    if (state.user) {
      // Set up a real-time listener for user data
      const userRef = state.db.collection("users").doc(state.user.uid);
      state.userListener = userRef.onSnapshot(doc => {
        console.log("User data updated in real-time.");
        const data = doc.exists ? doc.data() : {};
        state.selected = data.subjects || [];
        state.userDays = data.days || {};
        state.userThemeName = data.userThemeName || "Default";
        state.quizCompletion = data.quizCompletion || {};
        state.lectureDuration = data.lectureDuration || "03:00";
        state.cache = data.customSubjects || {};
        applyTheme(state.userThemeName);
        bootAfterDataLoad();
      });
    } else {
      // Handle logged-out state (using cookies)
      const data = loadDataFromCookies();
      Object.assign(state, data);
      applyTheme(state.userThemeName);
      bootAfterDataLoad();
    }
  }

  /* === LOGIC HELPERS === */

  function flattenWeeks() {
    state.weekDates = [];
    SEMESTER_WEEKS.forEach(w => {
      if (w.start1) state.weekDates.push({ n: w.n, start: w.start1, end: w.end1 });
      if (w.start2) state.weekDates.push({ n: w.n, start: w.start2, end: w.end2 });
    });
  }

  function initCurrentWeek() {
    const iso = todayISO();
    state.currentWeekData = state.weekDates.find(w => isBetween(iso, w.start, w.end)) || state.weekDates[0];
    if (!state.selectedWeekNumber) {
      state.selectedWeekNumber = state.currentWeekData ? state.currentWeekData.n : (state.weekDates.length > 0 ? state.weekDates[0].n : 1);
    }
  }

  function isSubjectEnded(subject, currentTime, durationMs) {
    if (!subject.time || subject.dayIndex === -1 || subject.dayIndex === undefined) return false;

    const [hour, minute] = subject.time.split(':').map(Number);

    // Create a new Date object for the subject's lecture this week to avoid modifying the original 'currentTime'
    const subjectDate = new Date(currentTime);
    subjectDate.setHours(0, 0, 0, 0); // Normalize to the beginning of the current day

    // Calculate the difference in days and set the correct date for the lecture
    const nowDayIndex = currentTime.getDay() === 0 ? 6 : currentTime.getDay() - 1;
    const dayDifference = subject.dayIndex - nowDayIndex;
    subjectDate.setDate(subjectDate.getDate() + dayDifference);

    // Set the specific time for the lecture on that calculated date
    subjectDate.setHours(hour, minute, 0, 0);

    const subjectEnd = new Date(subjectDate.getTime() + durationMs);
    return currentTime > subjectEnd;
  }

  function sortByWeekdayTimeAndStatus(subjs, selectedWeekNumber, currentWeekData, lectureDuration) {
    const now = new Date();
    const [hours, minutes] = lectureDuration.split(':').map(Number);
    const lectureDurationMs = (hours * 60 * 60 * 1000) + (minutes * 60 * 1000);

    const isSelectedWeekCurrent = currentWeekData && (selectedWeekNumber === currentWeekData.n);

    return subjs.sort((a, b) => {
      // For the current week, sort by "ended" status first
      if (isSelectedWeekCurrent) {
        const isEndedA = isSubjectEnded(a, now, lectureDurationMs);
        const isEndedB = isSubjectEnded(b, now, lectureDurationMs);
        if (isEndedA !== isEndedB) {
          return isEndedA ? 1 : -1; // Ended subjects go to the bottom.
        }
      }

      // For all weeks (or for subjects with the same "ended" status on the current week),
      // sort by day, then time.
      if (a.dayIndex !== b.dayIndex) return (a.dayIndex === -1 ? 7 : a.dayIndex) - (b.dayIndex === -1 ? 7 : b.dayIndex);
      if (a.time && b.time) return a.time.localeCompare(b.time);
      return a.name.localeCompare(b.name); // Fallback to name sort.
    });
  }

  function checkWeekCompletionStatus(weekNumber) {
    const currentWeekNum = state.currentWeekData ? state.currentWeekData.n : 1;
    if (weekNumber >= currentWeekNum) {
      return { status: 'none', count: 0 }; // Dots only for past weeks.
    }

    let totalQuizzes = 0;
    let missedCount = 0;

    for (const subjId of state.selected) {
      const subj = state.cache[subjId];
      if (!subj) continue;

      const subjectWeekData = subj.weeks?.find(w => w.week === weekNumber);
      const weekType = subjectWeekData?.type;

      if (['ლექცია (ქვიზი)', 'შუალედური', 'პრეზენტაცია'].includes(weekType)) {
        totalQuizzes++;
        const quizKey = `${subjId}_${weekNumber}`;
        const isCompleted = state.quizCompletion[quizKey] === true;

        if (!isCompleted) {
          missedCount++;
        }
      }
    }

    if (totalQuizzes === 0) { // If a past week has no quizzes, consider it completed.
      return { status: 'completed', count: 0 };
    }

    if (missedCount > 0) {
      return { status: 'missed', count: missedCount };
    }

    // If totalQuizzes > 0 and missedCount is 0, it means all are completed.
    return { status: 'completed', count: totalQuizzes };
  }

  function getEmbedIcon(type) {
    switch (type?.toLowerCase()) {
      case 'slide': return 'slideshow';
      case 'video': return 'play_circle';
      case 'book': return 'menu_book';
      default: return 'link';
    }
  }

  /* === UI RENDERING FUNCTIONS === */

  function createEmbedLinks(buttons, truncateCustomLabel = false) {
    const container = el('div', { className: 'embed-links' });
    if (!buttons || buttons.length === 0) {
      container.style.display = 'none'; // Hide container if no buttons
      return container;
    }

    buttons.forEach(b => {
      const isCustom = b.type === 'custom';
      const spanClass = isCustom ? 'span-2' : 'span-1';
      let labelText = b.label || '';

      const iconCircleClass = 'icon-circle' + (isCustom ? ' is-custom' : '');
      const linkClass = 'embed-link ' + spanClass;

      const link = el('a', { className: linkClass, href: b.link || '#', target: '_blank', title: b.label }, [
        el('div', { className: iconCircleClass }, [
          el('span', { className: 'material-symbols-outlined', textContent: getEmbedIcon(b.type) }),
          ...(isCustom ? [el('span', { className: 'label', textContent: labelText })] : [])])]);
      container.append(link);
    });
    return container;
  }

  function initLiveTime() {
    const timeEl = el('div', { className: 'time' });
    const dateEl = el('div', { className: 'date' });
    const timeCard = el('div', { id: 'live-time-card', className: 'widget-card' }, [timeEl, dateEl]);

    $('#home-grid').prepend(timeCard);

    function updateTime() {
      const now = new Date();
      timeEl.textContent = now.toLocaleTimeString('ka-GE', { hour: '2-digit', minute: '2-digit' });
      dateEl.textContent = now.toLocaleDateString('ka-GE', { weekday: 'long', month: 'long', day: 'numeric' });
    }
    updateTime();
    setInterval(updateTime, 1000);
  }

  function scheduleNextUpdate() {
    // Clear any existing timer to prevent duplicates
    clearTimeout(state.nextUpdateTimeout);

    const now = new Date();
    const eventTimes = [];

    // 1. Add next midnight
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 1, 0); // 1 second past midnight to be safe
    eventTimes.push(tomorrow);

    // 2. Add start and end times for today's subjects
    const todayDayIndex = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const [durHours, durMins] = state.lectureDuration.split(':').map(Number);
    const durationMs = (durHours * 60 * 60 * 1000) + (durMins * 60 * 1000);

    state.selected.forEach(subjId => {
      const dayData = state.userDays[subjId];
      const dayIndex = daysOfWeek.indexOf(dayData?.day);

      if (dayIndex === todayDayIndex && dayData.time) {
        const [startHour, startMinute] = dayData.time.split(':').map(Number);

        // Create a date object for the start time today
        const startTime = new Date(now);
        startTime.setHours(startHour, startMinute, 0, 0);
        eventTimes.push(startTime);

        // Create a date object for the end time today
        const endTime = new Date(startTime.getTime() + durationMs);
        eventTimes.push(endTime);
      }
    });

    // 3. Find the soonest future event
    const futureEvents = eventTimes
      .filter(t => t > now) // Only consider times in the future
      .sort((a, b) => a - b); // Sort them chronologically

    if (futureEvents.length > 0) {
      const nextEventTime = futureEvents[0];
      const timeUntilNextEvent = nextEventTime.getTime() - now.getTime();

      console.log(`Next UI update scheduled for: ${nextEventTime.toLocaleTimeString()}`);

      state.nextUpdateTimeout = setTimeout(() => {
        console.log("Auto-updating UI due to scheduled event...");
        renderHomePage(); // Re-render the home page
        scheduleNextUpdate(); // Schedule the *next* update after this one
      }, timeUntilNextEvent);
    }
  }

  function initSummaryWidget() {
    // Remove old widgets if they exist
    $('#weeks-left-card')?.remove();
    $$('.summary-widget-card').forEach(c => c.remove());

    // Quiz stats
    let completedQuizzes = 0;
    let missedQuizzes = 0;
    let remainingQuizzes = 0;
    const currentWeekNum = state.currentWeekData ? state.currentWeekData.n : 1; // Default to week 1 if not found

    // Iterate over every selected subject
    state.selected.forEach(subjId => {
      const subj = state.cache[subjId];
      if (!subj) return; // Skip if subject not in cache

      // Iterate over ALL possible semester weeks for each subject
      SEMESTER_WEEKS.forEach(semesterWeek => {
        const weekNumber = semesterWeek.n;

        // Find the specific week data for this subject, if it exists
        const subjectWeekData = subj.weeks?.find(w => w.week === weekNumber);
        const weekType = subjectWeekData?.type;

        // Only count if the week type indicates a quiz
        if (['ლექცია (ქვიზი)', 'შუალედური', 'პრეზენტაცია'].includes(weekType)) {
          const quizKey = `${subjId}_${weekNumber}`;
          const isCompleted = state.quizCompletion[quizKey] === true;

          if (isCompleted) {
            completedQuizzes++;
          } else if (weekNumber < currentWeekNum) {
            // Not completed and in the past -> Missed
            missedQuizzes++;
          } else {
            // Not completed and is current or future -> Remaining
            remainingQuizzes++;
          }
        }
      });
    });

    // --- Create Widget ---
    const createStatCard = (id, label, value, valueStyle = {}) => {
      const valueEl = el('div', { className: 'summary-value', textContent: value });
      Object.assign(valueEl.style, valueStyle);
      return el('div', { id, className: 'widget-card summary-widget-card' }, [
        valueEl,
        el('div', { className: 'summary-label', textContent: label })
      ]);
    };

    const completedStyle = { color: '#8c8c8c90' }; // Green
    const missedStyle = missedQuizzes > 0 ? { color: '#ff3c2e' } : { color: '#8c8c8c90' }; // Red if > 0, else gray

    const remainingCard = createStatCard('remaining-quizzes', 'ჩასაბარებელი ქვიზი', remainingQuizzes, {});
    const completedCard = createStatCard('completed-quizzes', 'ჩაბარებული ქვიზი', completedQuizzes, completedStyle);
    const missedCard = createStatCard('missed-quizzes', 'აღსადგენი ქვიზი', missedQuizzes, missedStyle);

    // Style the cards to be more like the time widget
    [remainingCard, completedCard, missedCard].forEach(card => {
      card.style.textAlign = 'center';
      card.style.justifyContent = 'center';
    });

    $('#live-time-card').after(missedCard);
    $('#live-time-card').after(completedCard);
    $('#live-time-card').after(remainingCard);
  }

  function renderWeeksBar() {
    const container = $('#weeks-bar-container');
    container.innerHTML = ''; // Clear previous content

    // --- Desktop Weeks Bar (Horizontal List) ---
    const chooser = el('div', { className: 'weeks-chooser' });
    SEMESTER_WEEKS.forEach(week => {
      const btn = el('button', { className: 'week-button' }, [
        el('span', { className: 'week-text-full', textContent: `კვირა ${week.n}` }),
        el('span', { className: 'week-text-short', textContent: `კვ. ${week.n}` }),
        el('span', { className: 'week-text-num', textContent: `${week.n}` })
      ]);
      if (week.n === state.selectedWeekNumber) btn.classList.add('active');
      if (state.currentWeekData && week.n === state.currentWeekData.n) btn.classList.add('is-current');

      const weekStatus = checkWeekCompletionStatus(week.n);
      if (weekStatus.status === 'missed') {
        btn.append(el('span', { className: 'missed-quiz-dot', textContent: weekStatus.count }));
      } else if (weekStatus.status === 'completed') {
        btn.append(el('span', { className: 'completed-quiz-dot' }, [
          el('span', { className: 'material-symbols-outlined', textContent: 'check', style: 'font-size: 1.2rem;' })
        ]));
      }

      btn.onclick = () => {
        state.selectedWeekNumber = week.n;
        renderHomePage();
        renderWeeksBar(); // Re-render to update active state
      };
      chooser.append(btn);
    });
    container.append(chooser);

    // --- Pre-render Mobile Navigator and append it ---
    const mobileNavTemplate = `
      <div class="weeks-mobile-nav" style="display: none; box-shadow: 0 0 0 5px var(--bg-color);">
        <button class="nav-arrow" id="mobile-prev-week"><span class="material-symbols-outlined">arrow_back_ios</span></button>
        <div class="current-week-display"></div>
        <button class="nav-arrow" id="mobile-next-week"><span class="material-symbols-outlined">arrow_forward_ios</span></button>
      </div>`;
    container.insertAdjacentHTML('beforeend', mobileNavTemplate);

    // --- Fullscreen Overlay Logic ---
    const weekSelectorOverlay = $('#week-selector-overlay');
    weekSelectorOverlay.onclick = (e) => { if (e.target === weekSelectorOverlay) weekSelectorOverlay.classList.remove('visible'); };

    // --- Mobile Navigator ---
    const prevWeek = () => {
      const currentIndex = SEMESTER_WEEKS.findIndex(w => w.n === state.selectedWeekNumber);
      if (currentIndex > 0) {
        state.selectedWeekNumber = SEMESTER_WEEKS[currentIndex - 1].n;
        renderHomePage();
        renderWeeksBar();
      }
    };
    const nextWeek = () => {
      const currentIndex = SEMESTER_WEEKS.findIndex(w => w.n === state.selectedWeekNumber);
      if (currentIndex < SEMESTER_WEEKS.length - 1) {
        state.selectedWeekNumber = SEMESTER_WEEKS[currentIndex + 1].n;
        renderHomePage();
        renderWeeksBar();
      }
    };

    // --- Update Pre-rendered Mobile Navigator ---
    const mobileNav = $('.weeks-mobile-nav');
    const weekDisplay = $('.current-week-display');
    const prevBtn = $('#mobile-prev-week');
    const nextBtn = $('#mobile-next-week');

    weekDisplay.textContent = `კვირა ${state.selectedWeekNumber}`;
    mobileNav.classList.remove('is-current'); // Reset class
    if (state.currentWeekData && state.selectedWeekNumber === state.currentWeekData.n) {
      mobileNav.classList.add('is-current');
    }
    const mobileWeekStatus = checkWeekCompletionStatus(state.selectedWeekNumber);
    if (mobileWeekStatus.status === 'missed') {
      mobileNav.append(el('span', { className: 'missed-quiz-dot', textContent: mobileWeekStatus.count }));
    } else if (mobileWeekStatus.status === 'completed') {
      mobileNav.append(el('span', { className: 'completed-quiz-dot' }, [
        el('span', { className: 'material-symbols-outlined', textContent: 'check', style: 'font-size: 1.2rem;' })
      ]));
    }

    prevBtn.onclick = prevWeek;
    nextBtn.onclick = nextWeek;
    prevBtn.disabled = state.selectedWeekNumber === 1;
    nextBtn.disabled = state.selectedWeekNumber === SEMESTER_WEEKS.length;
  }

  function renderHomePage() {
    const grid = $('#home-grid');
    // Clear only subject cards, not the time widget
    $$('#home-grid .subject-card').forEach(card => card.remove());

    const now = new Date();

    const subjectsForWeek = state.selected.map(id => {
      const subj = state.cache[id];
      if (!subj) return null;

      const dayData = state.userDays?.[id] ?? { day: null, time: null };
      const dayIndex = daysOfWeek.indexOf(dayData.day);

      let weekContentToShow = state.selectedWeekNumber;
      const isCurrentWeekSelected = state.currentWeekData && state.selectedWeekNumber === state.currentWeekData.n;
      let isUpcomingForContent = false;

      if (isCurrentWeekSelected && dayIndex !== -1 && dayData.time) {
        const [hours, minutes] = state.lectureDuration.split(':').map(Number);
        const lectureDurationMs = (hours * 60 * 60 * 1000) + (minutes * 60 * 1000);
        const ended = isSubjectEnded({ dayIndex, time: dayData.time }, now, lectureDurationMs);

        if (!ended && weekContentToShow > 1) { // If not ended (upcoming), show previous week
          weekContentToShow = state.selectedWeekNumber - 1;
          isUpcomingForContent = true;
        }
      }

      const weekData = subj.weeks?.find(w => w.week === weekContentToShow) || {};
      return {
        ...subj,
        weekTopic: weekData.topic || '<i>თემა არ არის მითითებული</i>',
        weekType: weekData.type,
        weekButtons: weekData.buttons,
        dayIndex: dayIndex,
        time: dayData.time,
        isScheduled: dayIndex !== -1,
        isUpcomingForContent: isUpcomingForContent // Pass this flag
      };
    }).filter(Boolean);

    const sortedSubjects = sortByWeekdayTimeAndStatus(subjectsForWeek, state.selectedWeekNumber, state.currentWeekData, state.lectureDuration);

    if (subjectsForWeek.length === 0) {
      if (!$('.empty-placeholder')) {
        grid.append(el('p', { className: 'empty-placeholder', textContent: 'საგნები არ არის არჩეული. დაამატე პარამეტრებიდან.' }));
      }
      return;
    } else {
      const placeholder = $('.empty-placeholder');
      if (placeholder) placeholder.remove();
    }

    sortedSubjects.forEach(subj => {
      let isUpcoming = false;
      const isSelectedWeekCurrent = state.currentWeekData && state.selectedWeekNumber === state.currentWeekData.n;
      const isSelectedWeekFuture = state.currentWeekData && state.selectedWeekNumber > state.currentWeekData.n;

      if (isSelectedWeekFuture || (isSelectedWeekCurrent && subj.isUpcomingForContent)) {
        isUpcoming = true;
      }

      const cardClasses = ['widget-card', 'subject-card'];
      if (isUpcoming) {
        cardClasses.push('is-upcoming');
      }

      const titleEl = el('h3', { className: 'subject-title', textContent: subj.name });
      if (subj.icon) {
        titleEl.prepend(el('span', { className: 'material-symbols-outlined', textContent: subj.icon }));
      }

      const dayCircle = el('div', { className: 'day-circle' });
      if (subj.isCustom) {
        dayCircle.textContent = 'სხვა';
        dayCircle.title = 'სხვა საგანი';
      } else if (subj.dayIndex !== -1) {
        dayCircle.textContent = dayAbbreviations[subj.dayIndex];
      } else {
        dayCircle.append(el('span', { className: 'material-symbols-outlined', textContent: 'event_busy' }));
        dayCircle.title = 'დღე არ არის მითითებული';
      }
      if (isUpcoming) {
        dayCircle.classList.add('is-upcoming');
      }

      const headerEl = el('div', { className: 'subject-card-header' }, [
        titleEl,
        dayCircle
      ]);

      const embedLinksContainer = createEmbedLinks(subj.weekButtons, true); // Truncate labels on home page

      if (subj.weekType === 'ლექცია (ქვიზი)' || subj.weekType === 'შუალედური' || subj.weekType === 'პრეზენტაცია') {
        const quizKey = `${subj.id}_${state.selectedWeekNumber}`;
        const isChecked = state.quizCompletion[quizKey] === true;
        const isPastWeek = state.currentWeekData && state.selectedWeekNumber < state.currentWeekData.n;

        const quizCheckButton = el('button', {
          className: 'quiz-check-btn',
          title: 'ქვიზი დაწერილია',
          style: 'grid-column: 4 / 5; grid-row: 1 / 2; align-self: center; justify-self: center;' // Pin to the top-right
        });
        if (isChecked) {
          quizCheckButton.classList.add('checked');
        } else if (isPastWeek) {
          quizCheckButton.classList.add('is-missed');
          quizCheckButton.title = 'ქვიზი გამოტოვებულია';
        }

        quizCheckButton.append(el('span', { className: 'material-symbols-outlined', textContent: 'check' }));

        quizCheckButton.onclick = (e) => {
          const isCurrentlyChecked = quizCheckButton.classList.contains('checked');
          const newState = !isCurrentlyChecked;

          saveQuizStatus(subj.id, state.selectedWeekNumber, newState);

          quizCheckButton.classList.toggle('checked', newState);
          quizCheckButton.classList.remove('is-missed');
          if (isPastWeek && !newState) {
            quizCheckButton.classList.add('is-missed');
          }
          initSummaryWidget();
          renderWeeksBar();
        };
        embedLinksContainer.append(quizCheckButton);
      }

      const subtitleEl = el('p', { className: 'widget-subtitle' });

      if (subj.weekType === 'პრეზენტაცია' || subj.weekType === 'შუალედური') {
        subtitleEl.className = 'widget-subtitle accent';
        subtitleEl.textContent = subj.weekType;
      } else if (subj.weekType === 'ლექცია (ქვიზი)') {
        subtitleEl.innerHTML = `ლექცია (<b style="color: var(--accent-color); font-weight: 700;">ქვიზი</b>)`;
      } else {
        subtitleEl.textContent = subj.weekType || 'ლექცია';
      }

      const card = el('div', { className: cardClasses.join(' ') }, [
        headerEl,
        subtitleEl,
        el('div', { className: 'topic', innerHTML: subj.weekTopic, style: 'margin-bottom: 10px;' }),
        embedLinksContainer
      ]);
      grid.append(card);
    });

    // After rendering, schedule the next automatic update
    scheduleNextUpdate();
  }

  function renderResourcesPage() {
    const grid = $('#resources-grid');
    grid.innerHTML = '';

    const todayDayIndex = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;

    const subjectsWithGlobalButtons = state.selected.map(id => {
      const subj = state.cache[id];
      const filteredGlobalButtons = subj?.globalButtons?.filter(b => b.link) || [];
      if (!subj || filteredGlobalButtons.length === 0) return null;

      const dayData = state.userDays?.[id] ?? { day: null, time: null };

      return {
        // Create a new, clean object instead of spreading the original `subj`
        name: subj.name,
        icon: subj.icon,
        globalButtons: filteredGlobalButtons, // Use the filtered array
        dayIndex: daysOfWeek.indexOf(dayData.day),
        time: dayData.time,
        isScheduled: dayData.day !== null
      };
    }).filter(Boolean);

    subjectsWithGlobalButtons.sort((a, b) => {
      const aScheduled = a.dayIndex > -1;
      const bScheduled = b.dayIndex > -1;

      if (aScheduled && !bScheduled) return -1;
      if (!aScheduled && bScheduled) return 1;
      if (!aScheduled && !bScheduled) return a.name.localeCompare(b.name);

      const isAUpcoming = a.dayIndex >= todayDayIndex;
      const isBUpcoming = b.dayIndex >= todayDayIndex;

      if (isAUpcoming !== isBUpcoming) return isAUpcoming ? -1 : 1;
      if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
      if (a.time && b.time) return a.time.localeCompare(b.time);

      return a.name.localeCompare(b.name);
    });

    if (subjectsWithGlobalButtons.length === 0) {
      grid.append(el('p', { className: 'empty-placeholder', textContent: 'არჩეულ საგნებს არ აქვს გლობალური რესურსები.' }));
      return;
    }

    subjectsWithGlobalButtons.forEach(subj => {
      const titleEl = el('h3', { className: 'widget-title', textContent: subj.name, classList: subj.icon ? 'has-icon' : '' });
      if (subj.icon) {
        titleEl.prepend(el('span', { className: 'material-symbols-outlined', textContent: subj.icon, style: 'color: var(--text-muted-color);' }));
      }
      const card = el('div', { className: 'widget-card' }, [
        titleEl,
        createEmbedLinks(subj.globalButtons, false) // `false` to not truncate, CSS will handle it
      ]);
      grid.append(card);
    });
  }

  function renderSettingsPage() {
    const grid = $('#settings-grid');
    grid.innerHTML = '';

    const leftColumn = el('div', { className: 'settings-column' });
    const rightColumn = el('div', { className: 'settings-column' });

    const sortedSelected = state.selected.map(id => state.cache[id]).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
    const subjectWidgetContainer = el('div', { className: 'subject-widget-container' });

    if (state.mySubjectCarouselIndex >= sortedSelected.length) {
      state.mySubjectCarouselIndex = Math.max(0, sortedSelected.length - 1);
    }

    const prevBtn = el('button', { className: 'subject-carousel-nav-btn prev' }, [el('span', { className: 'material-symbols-outlined', textContent: 'arrow_back_ios_new' })]);
    const nextBtn = el('button', { className: 'subject-carousel-nav-btn next' }, [el('span', { className: 'material-symbols-outlined', textContent: 'arrow_forward_ios' })]);

    prevBtn.onclick = () => {
      if (state.mySubjectCarouselIndex > 0) {
        state.mySubjectCarouselIndex--;
        renderSettingsPage();
      }
    };
    nextBtn.onclick = () => {
      if (state.mySubjectCarouselIndex < sortedSelected.length - 1) {
        state.mySubjectCarouselIndex++;
        renderSettingsPage();
      }
    };

    prevBtn.disabled = state.mySubjectCarouselIndex === 0;
    nextBtn.disabled = state.mySubjectCarouselIndex >= sortedSelected.length - 1;

    if (sortedSelected.length > 0) {
      const currentSubject = sortedSelected[state.mySubjectCarouselIndex];
      subjectWidgetContainer.append(createMySubjectWidget(currentSubject));
    } else {
      subjectWidgetContainer.append(el('div', { className: 'widget-card my-subject-widget' }, [el('p', { className: 'empty-placeholder padded', textContent: 'საგნები არ არის არჩეული.' })]));
    }

    // Create the new navigation widget
    const arrowsWidget = el('div', { className: 'widget-card subject-nav-widget' }, [
      prevBtn,
      el('div', { className: 'subject-counter', textContent: sortedSelected.length > 0 ? `${state.mySubjectCarouselIndex + 1} / ${sortedSelected.length}` : '0 / 0' }),
      nextBtn
    ]);

    const searchInput = el('input', { id: 'catalog-search', type: 'search', placeholder: 'საგნის მოძებნა...' });
    const searchContainer = el('div', { className: 'search-input-container' }, [
      el('span', { className: 'material-symbols-outlined', textContent: 'search' }),
      searchInput
    ]);

    const catalogContent = el('div', { className: 'settings-widget-content no-padding-right' });

    const renderCatalogItems = (filter = '') => {
      // Create a map to ensure uniqueness, preferring items from cache (which includes custom subjects)
      const subjectMap = new Map();
      state.catalog.forEach(subj => subjectMap.set(subj.id, subj));
      Object.values(state.cache).forEach(subj => subjectMap.set(subj.id, subj));

      const allSubjects = Array.from(subjectMap.values());

      catalogContent.innerHTML = '';
      let subjectsToShow;

      // Sort all subjects by: 1. Added status, 2. Custom status, 3. Name
      allSubjects.sort((a, b) => {
        const isAddedA = state.selected.includes(a.id);
        const isAddedB = state.selected.includes(b.id);
        if (isAddedA !== isAddedB) return isAddedA ? -1 : 1; // Added subjects first

        const isCustomA = a.isCustom || false;
        const isCustomB = b.isCustom || false;
        if (isCustomA !== isCustomB) return isCustomA ? -1 : 1; // Custom subjects first within their group

        return a.name.localeCompare(b.name); // Finally, sort by name
      });

      if (filter) {
        subjectsToShow = allSubjects.filter(s => s.name.toLowerCase().includes(filter.toLowerCase()));
      } else {
        subjectsToShow = allSubjects; // Show all subjects, no limit
      }

      subjectsToShow.forEach(subj => {
        const isAdded = state.selected.includes(subj.id);
        let button;
        const nameDiv = el('div', { className: 'name', textContent: subj.name });
        const itemContainer = el('div', { className: 'settings-item' }, [nameDiv]);

        // Add subject icon to catalog item
        if (subj.icon) {
          nameDiv.prepend(el('span', { className: 'material-symbols-outlined', textContent: subj.icon, style: 'font-size: 1.2rem; margin-right: 8px; color: var(--text-muted-color);' }));
        }

        if (isAdded) {
          button = el('button', { className: 'action-btn remove-from-catalog' }, [el('span', { className: 'material-symbols-outlined', textContent: 'close' })]);
          button.onclick = () => {
            // Filter from selected list
            state.selected = state.selected.filter(id => id !== subj.id);
            delete state.userDays[subj.id];
            // If it's a custom subject, also remove it from the cache to prevent re-adding on refresh
            if (subj.isCustom) {
              delete state.cache[subj.id];
            }

            autoSave();
            renderSettingsPage();
            renderHomePage();
          };
        } else {
          button = el('button', { className: 'action-btn' }, [el('span', { className: 'material-symbols-outlined', textContent: 'add' })]);
          button.onclick = () => {
            state.selected.push(subj.id);
            state.userDays[subj.id] = { day: daysOfWeek[0], time: "09:00" };
            autoSave();
            renderSettingsPage();
            renderHomePage();
          };
        }

        if (subj.isCustom) {
          nameDiv.prepend(el('span', { className: 'material-symbols-outlined', textContent: 'person', style: 'font-size: 1.2rem; margin-right: 8px; color: var(--text-muted-color);' }));
        }

        itemContainer.append(button);
        catalogContent.append(itemContainer);
      });
    };

    searchInput.oninput = () => renderCatalogItems(searchInput.value);
    renderCatalogItems();

    const catalogCard = el('div', { id: 'catalog-widget', className: 'widget-card' }, [
      el('h3', { className: 'widget-title', textContent: 'საგნების კატალოგი'}),
      searchContainer,
      catalogContent
    ]);

    // Function to delete a custom subject from the database
    const deleteCustomSubjectFromDB = async (subjectId) => {
        if (state.user) {
            const userRef = state.db.collection("users").doc(state.user.uid);
            await userRef.update({
                [`customSubjects.${subjectId}`]: firebase.firestore.FieldValue.delete()
            });
        }
    };
    // -- Manage Subjects Widget -- (Styled like logout button)
    const manageButton = el('a', {
        href: 'manage.html',
        textContent: 'საგნების მართვა',
        className: 'logout-button', // Re-use logout button style
        style: 'text-decoration: none; display: block; text-align: center; background-color: var(--accent-color); color: var(--text-on-accent-color);'
    });
    const manageWidget = el('div', {
        className: 'widget-card',
        style: 'padding: 10px;' // Use widget color, just adjust padding
    }, [manageButton]);

    // --- Assemble Columns ---
    // Left Column: Manage Subjects button and Catalog
    leftColumn.append(manageWidget, catalogCard);

    // Right Column: My Subjects carousel, Duration, Theme, and Logout
    rightColumn.append(subjectWidgetContainer, arrowsWidget, createDurationWidget(), createThemeWidget(), createLogoutWidget());

    // Add columns to the grid
    grid.append(leftColumn, rightColumn);
  }

  function createMySubjectWidget(subj) {
    const lectureStartTimes = ["09:00", "11:20", "13:40", "16:00", "18:20"].sort();
    const currentDay = state.userDays[subj.id]?.day;

    const timeSelect = el('select', { className: 'day-time-select' });
    lectureStartTimes.forEach(time => {
      const opt = el('option', { value: time, textContent: time });
      if (state.userDays[subj.id]?.time === time) opt.selected = true;
      timeSelect.append(opt);
    });
    timeSelect.onchange = () => {
      if (!state.userDays[subj.id]) state.userDays[subj.id] = { day: null, time: null };
      state.userDays[subj.id].time = timeSelect.value;
      autoSave();
    };

    const weekdayContainer = el('div', { className: 'weekday-chooser' });
    daysOfWeek.forEach((day, index) => {
      const dayBtn = el('button', {
        className: 'weekday-btn',
        textContent: dayAbbreviations[index],
        title: day
      });
      if (currentDay === day) {
        dayBtn.classList.add('active');
      }
      dayBtn.onclick = () => {
        if (!state.userDays[subj.id]) state.userDays[subj.id] = { day: null, time: null };
        if (state.userDays[subj.id].day !== day) {
          state.userDays[subj.id].day = day;
          autoSave();
          renderSettingsPage();
        }
      };
      weekdayContainer.append(dayBtn);
    });

    const removeBtn = el('button', { className: 'action-btn remove' }, [
      el('span', { className: 'material-symbols-outlined', textContent: 'close' })
    ]);
    removeBtn.onclick = () => {
      if (confirm(`დარწმუნებული ხართ, რომ გსურთ საგნის "${subj.name}" წაშლა?`)) {
        const subjectToRemove = state.cache[subj.id];

        // Filter from selected list
        state.selected = state.selected.filter(id => id !== subj.id);
        delete state.userDays[subj.id];

        // If it's a custom subject, remove it from cache and database
        if (subjectToRemove?.isCustom) {
          delete state.cache[subj.id];
          // This will trigger a save that removes the subject from the DB
          deleteCustomSubjectFromDB(subj.id);
        }

        autoSave();
        renderSettingsPage();
      }
    };

    const titleEl = el('h3', { className: 'widget-title', textContent: subj.name, classList: subj.icon ? 'has-icon' : '' });
    if (subj.icon) {
      titleEl.prepend(el('span', { className: 'material-symbols-outlined', textContent: subj.icon }));
    }

    const topControls = el('div', { className: 'my-subject-widget-top-controls' }, [timeSelect, removeBtn]);

    return el('div', { className: 'widget-card my-subject-widget' }, [
      el('div', { className: 'my-subject-widget-header' }, [
        titleEl,
      ]),
      topControls,
      weekdayContainer
    ]);
  }

  function createDurationWidget() {
    const [initialHour, initialMinute] = state.lectureDuration.split(':');

    const hourSelect = el('select', { className: 'day-time-select' });
    for (let i = 0; i <= 4; i++) {
      hourSelect.append(el('option', { value: i, textContent: `${i} სთ`, selected: i == initialHour }));
    }

    const minuteSelect = el('select', { className: 'day-time-select' });
    for (let i = 0; i <= 55; i += 5) {
      minuteSelect.append(el('option', { value: i, textContent: `${i} წთ`, selected: i == initialMinute }));
    }

    const updateDuration = () => {
      state.lectureDuration = `${hourSelect.value}:${minuteSelect.value}`;
      autoSave();
    };
    hourSelect.onchange = updateDuration;
    minuteSelect.onchange = updateDuration;

    const container = el('div', { className: 'duration-selector' }, [hourSelect, minuteSelect]);
    return el('div', { className: 'widget-card' }, [
      el('h3', { className: 'widget-title', textContent: 'ლექციის ხანგრძლივობა' }),
      container
    ]);
  }

  function createThemeWidget() {
    const themeOptions = Object.keys(THEMES).map(themeName => {
      const theme = THEMES[themeName];
      const option = el('div', { className: 'theme-option' }, [
        el('div', { className: 'name', textContent: themeName }),
        el('div', { className: 'swatches' }, [
          el('div', { className: 'swatch', style: `background-color: ${theme.bg}` }),
          el('div', { className: 'swatch', style: `background-color: ${theme.widget}` }),
          el('div', { className: 'swatch', style: `background-color: ${theme.accent}` }),
        ])
      ]);
      if (themeName === state.userThemeName) {
        option.classList.add('active');
      }
      option.onclick = () => {
        saveTheme(themeName);
        renderSettingsPage();
      };
      return option;
    });

    return el('div', { className: 'widget-card theme-selector' }, [
      el('h3', { className: 'widget-title', textContent: 'თემის არჩევა' }),
      el('div', { className: 'themes' }, themeOptions)
    ]);
  }

  function createLogoutWidget() {
    const logoutButton = el('button', {
      className: 'logout-button',
      textContent: 'გასვლა'
    });
    logoutButton.onclick = async () => {
      try {
        await state.auth.signOut();
        location.reload();
      } catch (error) {
        console.error("Error signing out:", error);
      }
    };
    return el('div', { className: 'widget-card' }, [logoutButton]);
  }

  /* === INITIALIZATION & EVENT LISTENERS === */

  function initNavigation() {
    const navItems = $$('.nav-item');
    const views = $$('.view');
    const pageTitle = $('#page-title');

    document.body.dataset.activeView = 'live-view';
    applyBodyPadding(document.body.dataset.activeView); // Apply initial padding on load

    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const viewId = item.dataset.view;

        // Check if the clicked item is already active
        if (item.classList.contains('active')) {
          // If yes, just refresh the content of that view
          console.log(`Refreshing view: ${viewId}`);
          switch (viewId) {
            case 'live-view':
              renderHomePage();
              initSummaryWidget(); // Also refresh summary
              break;
            case 'resources-view':
              renderResourcesPage();
              break;
            case 'settings-view':
              renderSettingsPage();
              break;
          }
        } else {
          // If not, switch to the new view
          navItems.forEach(i => i.classList.remove('active'));
          item.classList.add('active');

          views.forEach(v => v.classList.remove('active'));
          $(`#${viewId}`).classList.add('active');

          pageTitle.textContent = item.dataset.title;
          document.body.dataset.activeView = viewId;
          applyBodyPadding(viewId); // Apply padding after view change

          // Scroll to the top of the page for a clean transition
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    });

    // Add a resize listener to adjust padding if the user resizes the window
    // or rotates their device.
    window.addEventListener('resize', () => {
      applyBodyPadding(document.body.dataset.activeView);
    });
  }

  // New function to apply body padding based on view and screen size
  function applyBodyPadding(activeViewId) {
    const mobileBreakpoint = 700; // Matches the CSS media query
    const isMobile = window.innerWidth <= mobileBreakpoint;

    if (isMobile && (activeViewId === 'resources-view' || activeViewId === 'settings-view')) {
      document.body.style.padding = '15px 15px 120px 15px';
    } else if (isMobile) {
      document.body.style.padding = '100px 15px 120px 15px'; // Default mobile padding from index.css
    } else {
      document.body.style.padding = '20px 20px 100px 20px'; // Default desktop padding from index.css
    }
  }

  function bootAfterDataLoad() {
    // This function runs after data is loaded/updated
    // Ensure all selected subjects are in the cache
    const toLoad = state.selected.filter(id => !state.cache[id]);
    for (const id of toLoad) {
      const subj = state.catalog.find(c => c.id === id);
      if (subj) state.cache[id] = subj;
    }

    flattenWeeks();
    initCurrentWeek();

    renderWeeksBar();
    renderHomePage();
    renderResourcesPage();
    renderSettingsPage();

    initSummaryWidget();
    scheduleNextUpdate();
  }

  async function bootAfterLogin() {
    await loadData();
    initLiveTime();
    initNavigation();
  }

  function initAuth() {
    state.auth.onAuthStateChanged(async user => {
      state.user = user || null;
      const loginOverlay = $("#login-overlay");
      const loadingOverlay = $("#loadingOverlay");
      try {
        if (user) {
          // User is logged in
          loginOverlay.style.display = "none";
          await bootAfterLogin();
        } else {
          // User is logged out
          if (state.userListener) state.userListener(); // Unsubscribe from real-time updates
          state.userListener = null;
          loginOverlay.style.display = "flex";
          await bootAfterLogin(); // Now boot with data from cookies
        }
      } catch (error) {
        console.error("Bootstrapping failed:", error);
        loadingOverlay.innerHTML = `<h2 style='color:red;text-align:center;margin-top:30vh;'>⚠️ აპლიკაციის ჩატვირთვა ვერ მოხერხდა.</h2><p style='color:var(--text-muted-color)'>${error.message}</p>`;
      } finally {
        loadingOverlay.classList.add("hidden");
      }
    });    
  }

  function main() {
    const loadingOverlay = $("#loadingOverlay");
    fetch("https://raw.githubusercontent.com/WEEKGE/live/main/config.json")
      .then(r => r.json())
      .then(cfg => {
        firebase.initializeApp(cfg);
        state.auth = firebase.auth();
        state.db = firebase.firestore();
        
        $("#signInBtn").onclick = async () => {
          const provider = new firebase.auth.GoogleAuthProvider();
          try {
            await state.auth.signInWithPopup(provider);
          } catch (err) {
            console.error("Sign-in error:", err);
            if (err.code === 'auth/popup-closed-by-user') return;
            const userMessage = err.code === 'auth/popup-blocked'
              ? "Sign-in popup was blocked. Please allow popups for this site."
              : `Sign-in failed: ${err.message}`;
            alert(userMessage);
          }
        };

        initAuth();
      })
      .catch(() => {
        loadingOverlay.innerHTML = "<h2 style='color:red;text-align:center;margin-top:30vh;'>⚠️ config.json ვერ ჩაიტვირთა.</h2>";
      });
  }

  // Start the application
  main();

})();
