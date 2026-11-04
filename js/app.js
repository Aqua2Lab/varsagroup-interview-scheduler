/*
 * Varsa Group LLC cashier interview page.
 *
 * ONE CONFIG SPOT
 * Paste the Apps Script web app URL between the quotes below.
 * It looks like https://script.google.com/macros/s/XXXXXXXX/exec
 * Use the /exec address, not /dev. Steps are in the README.
 *
 * The request uses Content-Type: text/plain on purpose. application/json
 * makes the browser send a preflight that Apps Script does not answer.
 */
(function () {
  'use strict';

  var WEB_APP_URL = 'PASTE_YOUR_WEB_APP_URL_HERE';

  var TAKEN_MESSAGE = 'That time was just taken. Please pick another.';
  var LOCATION_LINE = 'Chevron and OutRun stores, Hwy 43, Thomasville, AL';
  var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  var DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  var state = {
    days: [],
    selectedDate: '',
    selectedSlotId: '',
    preview: true,
    busy: false
  };
  var previewBookings = [];

  var els = {};

  function init() {
    els.banner = document.getElementById('banner');
    els.bannerText = document.getElementById('banner-text');
    els.retry = document.getElementById('retry-btn');
    els.preview = document.getElementById('preview-banner');
    els.openCount = document.getElementById('open-count');
    els.days = document.getElementById('day-list');
    els.slots = document.getElementById('slot-panel');
    els.continueBtn = document.getElementById('continue-btn');
    els.summary = document.getElementById('selected-summary');
    els.form = document.getElementById('booking-form');
    els.submit = document.getElementById('submit-btn');
    els.picker = document.getElementById('picker');
    els.confirm = document.getElementById('confirm');
    els.confirmTitle = document.getElementById('confirm-title');
    els.confirmLead = document.getElementById('confirm-lead');
    els.confirmNote = document.getElementById('confirm-note');

    if (!window.fetch) {
      showBanner('This browser can’t load the interview times. Try the latest Chrome or Safari.', 'error');
      return;
    }

    els.retry.addEventListener('click', function () { load(); });
    els.continueBtn.addEventListener('click', function () {
      document.getElementById('details').scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.getElementById('name').focus();
    });
    els.form.addEventListener('submit', onSubmit);
    els.form.addEventListener('input', function (event) {
      var field = event.target.id || (event.target.name === 'store' ? 'store' : '');
      if (field) clearField(field);
    });
    document.querySelectorAll('input[name="store"]').forEach(function (input) {
      input.addEventListener('change', syncStores);
    });
    document.getElementById('phone').addEventListener('blur', function () {
      var pretty = formatPhone(this.value);
      if (pretty) this.value = pretty;
    });
    document.getElementById('print-btn').addEventListener('click', function () { window.print(); });
    document.getElementById('another-btn').addEventListener('click', bookAnother);
    syncStores();
    load();
  }

  function configuredUrl() {
    var url = String(WEB_APP_URL || '').trim().replace(/^['"]|['"]$/g, '');
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/.test(url)) return '';
    return url;
  }

  function load(options) {
    options = options || {};
    var url = configuredUrl();
    state.preview = !url;
    els.preview.hidden = !state.preview;
    if (!options.keepBanner) hideBanner();
    if (state.preview) {
      var demo = demoPayload();
      if (!demo.ok) showBanner('Sample times could not be built.', 'error');
      applyPayload(demo);
      return;
    }
    els.openCount.textContent = 'Loading open times…';
    fetch(url + (url.indexOf('?') === -1 ? '?' : '&') + 'action=slots&t=' + Date.now(), {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store'
    }).then(function (res) {
      return res.text();
    }).then(function (text) {
      var data = parseService(text);
      if (!data.ok) throw displayError(data.message || 'The schedule could not be loaded.');
      applyPayload(data);
    }).catch(function (err) {
      state.days = [];
      renderDays();
      clear(els.slots);
      els.slots.appendChild(paragraph('Times couldn’t be loaded.'));
      els.openCount.textContent = '';
      var message = err && err.message ? err.message : 'The schedule could not be loaded.';
      if (/failed to fetch|networkerror|load failed/i.test(message)) {
        message = 'We couldn’t reach the booking service. Check your connection and try again.';
      }
      showBanner(message, 'error');
    });
  }

  function applyPayload(data) {
    state.days = Array.isArray(data.days) ? data.days : [];
    var stillThere = findSlot(state.selectedSlotId);
    if (!stillThere) state.selectedSlotId = '';
    if (!state.days.some(function (day) { return day.date === state.selectedDate && day.openCount; })) {
      var firstOpen = state.days.filter(function (day) { return day.openCount > 0; })[0];
      state.selectedDate = (firstOpen || state.days[0] || {}).date || '';
    }
    var open = Number(data.openCount || 0);
    if (state.preview) {
      els.openCount.textContent = open + ' sample time' + (open === 1 ? '' : 's') + ' on this preview.';
    } else if (open === 0) {
      els.openCount.textContent = 'No times left for November 9–13.';
    } else {
      els.openCount.textContent = open + ' time' + (open === 1 ? '' : 's') + ' still open.';
    }
    renderDays();
    renderSlots();
    updateSummary();
  }

  function renderDays() {
    clear(els.days);
    if (!state.days.length) return;
    state.days.forEach(function (day) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'day-btn';
      var selectedHere = dayHasSelection(day);
      if (selectedHere && day.date !== state.selectedDate) btn.classList.add('has-selection');
      btn.setAttribute('aria-pressed', day.date === state.selectedDate ? 'true' : 'false');
      var dow = document.createElement('span');
      dow.className = 'dow';
      dow.textContent = shortDow(day.date);
      var num = document.createElement('span');
      num.className = 'num';
      num.textContent = String(dayNumber(day.date));
      var count = document.createElement('span');
      count.className = 'count';
      count.textContent = day.openCount ? String(day.openCount) + ' open' : 'Full';
      btn.appendChild(dow);
      btn.appendChild(num);
      btn.appendChild(count);
      btn.setAttribute('aria-label', (day.label || day.date) + (day.openCount ? ', ' + day.openCount + ' times open' : ', no times left'));
      btn.addEventListener('click', function () {
        state.selectedDate = day.date;
        renderDays();
        renderSlots();
      });
      els.days.appendChild(btn);
    });
  }

  function renderSlots() {
    clear(els.slots);
    var day = selectedDay();
    if (!day) {
      els.slots.appendChild(paragraph('No interview days are on the schedule yet.'));
      return;
    }
    var heading = document.createElement('h2');
    heading.textContent = day.label || day.date;
    els.slots.appendChild(heading);
    var sub = document.createElement('p');
    sub.className = 'muted';
    sub.textContent = day.openCount
      ? day.openCount + (day.openCount === 1 ? ' time open' : ' times open')
      : 'No open times this day.';
    els.slots.appendChild(sub);
    if (!day.openCount) return;

    var morning = [];
    var midday = [];
    var afternoon = [];
    day.slots.forEach(function (slot) {
      var start = Number(slot.startMinutes);
      if (start < 12 * 60) morning.push(slot);
      else if (start < 13 * 60) midday.push(slot);
      else afternoon.push(slot);
    });

    if (morning.length) {
      els.slots.appendChild(groupLabel('Morning'));
      els.slots.appendChild(timeGrid(morning, day));
    } else if (afternoon.length || midday.length) {
      els.slots.appendChild(paragraph('Morning times are taken.', 'muted'));
    }

    if (midday.length) {
      els.slots.appendChild(groupLabel('Midday'));
      els.slots.appendChild(timeGrid(midday, day));
    }

    var note = document.createElement('p');
    note.className = 'lunch';
    note.textContent = '12:00–1:00 PM is lunch. No interviews.';
    els.slots.appendChild(note);

    if (afternoon.length) {
      els.slots.appendChild(groupLabel('Afternoon'));
      els.slots.appendChild(timeGrid(afternoon, day));
    } else if (morning.length || midday.length) {
      els.slots.appendChild(paragraph('Afternoon times are taken.', 'muted'));
    }
  }

  function timeGrid(slots, day) {
    var grid = document.createElement('div');
    grid.className = 'times';
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', (day.label || 'Day') + ' times');
    slots.forEach(function (slot) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'time-btn';
      btn.textContent = slot.start || slot.label;
      btn.setAttribute('aria-pressed', slot.id === state.selectedSlotId ? 'true' : 'false');
      btn.setAttribute('aria-label', (day.label || '') + ' ' + (slot.label || slot.start));
      btn.addEventListener('click', function () {
        state.selectedSlotId = slot.id;
        state.selectedDate = day.date;
        hideBanner();
        renderDays();
        renderSlots();
        updateSummary();
        els.continueBtn.hidden = false;
      });
      grid.appendChild(btn);
    });
    return grid;
  }

  function updateSummary() {
    var found = findSlot(state.selectedSlotId);
    if (!found) {
      els.summary.textContent = 'No time selected yet.';
      els.continueBtn.hidden = true;
      els.submit.textContent = 'Choose a time first';
      return;
    }
    els.summary.textContent = found.day.label + ' · ' + (found.slot.label || found.slot.start);
    els.continueBtn.hidden = false;
    els.submit.textContent = 'Book this interview';
  }

  function onSubmit(event) {
    event.preventDefault();
    if (state.busy) return;
    clearErrors();
    hideBanner();
    var check = validateForm();
    if (!check.ok) {
      showFieldError(check.field, check.message);
      return;
    }
    setBusy(true);
    var url = configuredUrl();
    var pending = state.preview ? Promise.resolve(previewBook(check.payload)) : postBooking(url, check.payload);
    pending.then(function (data) {
      applyResult(data);
    }).catch(function (err) {
      showBanner(err && err.message ? err.message : 'The booking could not be saved. Please try again.', 'error');
    }).then(function () {
      setBusy(false);
    });
  }

  function postBooking(url, payload) {
    return fetch(url, {
      method: 'POST',
      redirect: 'follow',
      cache: 'no-store',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.text();
    }).then(parseService);
  }

  function applyResult(data) {
    if (!data || typeof data !== 'object') {
      showBanner('The booking service sent an unexpected response. Please try again.', 'error');
      return;
    }
    if (data.ok) {
      removeSlot(data.slotId || state.selectedSlotId);
      showConfirmation(data);
      return;
    }
    if (data.code === 'SLOT_TAKEN' || data.code === 'NOT_FOUND' || data.code === 'PAST') {
      removeSlot(state.selectedSlotId);
      state.selectedSlotId = '';
      renderDays();
      renderSlots();
      updateSummary();
      showBanner(data.message || TAKEN_MESSAGE, 'error');
      document.getElementById('times').scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (!state.preview) load({ keepBanner: true });
      return;
    }
    if (data.code === 'ALREADY_BOOKED') {
      showConfirmation(data);
      return;
    }
    if (data.code === 'INVALID' && data.field && data.field !== 'slotId') {
      showFieldError(data.field, data.message || 'Check that field.');
      return;
    }
    showBanner(data.message || 'Something went wrong. Please try again.', 'error');
  }

  function showConfirmation(data) {
    var otherTime = data.code === 'ALREADY_BOOKED';
    els.confirmTitle.textContent = otherTime ? 'You already have a time' : 'You’re booked';
    els.confirmLead.textContent = otherTime
      ? 'This email already has an interview. Each person can hold one time.'
      : (data.alreadyHadBooking ? 'This time was already saved for this email.' : 'Your cashier interview is on the schedule.');
    text('c-when', data.whenLabel || '');
    text('c-time', data.timeLabel || '');
    text('c-where', data.locationLine || LOCATION_LINE);
    text('c-name', data.name || document.getElementById('name').value);
    text('c-phone', data.phone || formatPhone(document.getElementById('phone').value) || document.getElementById('phone').value);
    text('c-email', data.email || '');
    text('c-store', data.store || '');
    text('c-ref', data.bookingId || '');

    var note;
    if (state.preview) {
      note = 'Preview only. Nothing was saved and no email was sent.';
    } else if (otherTime) {
      note = 'To change or cancel, reply to your confirmation email.';
    } else if (data.emailSent || data.emailStatus === 'already sent') {
      note = 'A confirmation email is on its way to ' + (data.email || 'you') + '.';
    } else {
      note = 'Your time is saved, but the confirmation email could not be sent. Write down the time or print this page.';
    }
    els.confirmNote.textContent = note;
    els.picker.hidden = true;
    els.confirm.hidden = false;
    hideBanner();
    els.confirm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    els.confirmTitle.focus();
  }

  function bookAnother() {
    els.confirm.hidden = true;
    els.picker.hidden = false;
    document.getElementById('name').value = '';
    document.getElementById('phone').value = '';
    document.getElementById('email').value = '';
    clearErrors();
    state.selectedSlotId = '';
    hideBanner();
    if (state.preview) {
      renderDays();
      renderSlots();
      updateSummary();
    } else {
      load();
    }
    document.getElementById('name').focus();
  }

  function previewBook(payload) {
    var found = findSlot(payload.slotId);
    if (!found) {
      return { ok: false, code: 'SLOT_TAKEN', message: TAKEN_MESSAGE };
    }
    var email = payload.email.toLowerCase();
    var existing = null;
    previewBookings.forEach(function (item) {
      if (item.email === email) existing = item;
    });
    if (existing && existing.slotId === payload.slotId) {
      return Object.assign({}, existing, { ok: true, alreadyHadBooking: true, emailSent: false, calendarCreated: false });
    }
    if (existing) {
      return Object.assign({}, existing, {
        ok: false,
        code: 'ALREADY_BOOKED',
        message: 'This email already has an interview booked. Each person can hold one time.'
      });
    }
    var booking = {
      ok: true,
      code: 'BOOKED',
      bookingId: 'VG-PREVIEW',
      slotId: payload.slotId,
      name: payload.name,
      phone: formatPhone(payload.phone) || payload.phone,
      email: email,
      store: payload.store,
      whenLabel: whenLabel(found.day.date),
      timeLabel: timeRange(found.slot.startMinutes, found.slot.endMinutes),
      locationLine: LOCATION_LINE,
      emailSent: false,
      calendarCreated: false
    };
    previewBookings.push(booking);
    return booking;
  }

  function validateForm() {
    var slot = findSlot(state.selectedSlotId);
    if (!slot) return { ok: false, field: 'slotId', message: 'Choose a time first.' };

    var name = document.getElementById('name').value.replace(/\s+/g, ' ').trim();
    if (name.length < 2 || name.length > 80 || !/^[\p{L}][\p{L}\p{M} .'’-]+$/u.test(name)) {
      return { ok: false, field: 'name', message: 'Enter your first and last name.' };
    }

    var digits = document.getElementById('phone').value.replace(/\D/g, '');
    if (digits.length === 11 && digits.charAt(0) === '1') digits = digits.slice(1);
    if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) {
      return { ok: false, field: 'phone', message: 'Enter a 10-digit phone number.' };
    }

    var email = document.getElementById('email').value.trim().toLowerCase();
    if (email.length > 120 || !/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i.test(email)) {
      return { ok: false, field: 'email', message: 'Enter a valid email address.' };
    }

    var storeInput = document.querySelector('input[name="store"]:checked');
    var store = storeInput ? storeInput.value : '';
    if (store !== 'Chevron' && store !== 'OutRun' && store !== 'Either') {
      return { ok: false, field: 'store', message: 'Choose Chevron, OutRun, or Either.' };
    }

    return {
      ok: true,
      payload: {
        slotId: slot.slot.id,
        name: name,
        phone: '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6),
        email: email,
        store: store
      }
    };
  }

  function demoPayload() {
    var dates = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'];
    var starts = [];
    var m;
    for (m = 9 * 60; m < 12 * 60; m += 20) starts.push(m);
    for (m = 13 * 60; m < 17 * 60; m += 20) starts.push(m);
    var days = dates.map(function (date) {
      return {
        date: date,
        label: dayLabel(date),
        openCount: starts.length,
        slots: starts.map(function (start) {
          return {
            id: date.replace(/-/g, '') + '-' + pad2(Math.floor(start / 60)) + pad2(start % 60),
            start: formatMinutes(start),
            end: formatMinutes(start + 20),
            startMinutes: start,
            endMinutes: start + 20,
            label: timeRange(start, start + 20).replace(' Central', '')
          };
        })
      };
    });
    var total = days.reduce(function (sum, day) { return sum + day.slots.length; }, 0);
    if (total !== 105 || starts.length !== 21) {
      return { ok: false, days: [], openCount: 0 };
    }
    return { ok: true, preview: true, openCount: total, totalCount: total, days: days, locationLine: LOCATION_LINE };
  }

  function findSlot(id) {
    if (!id) return null;
    var found = null;
    state.days.forEach(function (day) {
      (day.slots || []).forEach(function (slot) {
        if (slot.id === id) found = { day: day, slot: slot };
      });
    });
    return found;
  }

  function removeSlot(id) {
    if (!id) return;
    state.days.forEach(function (day) {
      var before = day.slots.length;
      day.slots = day.slots.filter(function (slot) { return slot.id !== id; });
      if (day.slots.length !== before) day.openCount = day.slots.length;
    });
  }

  function selectedDay() {
    var match = null;
    state.days.forEach(function (day) {
      if (day.date === state.selectedDate) match = day;
    });
    return match;
  }

  function dayHasSelection(day) {
    return (day.slots || []).some(function (slot) { return slot.id === state.selectedSlotId; });
  }

  function showBanner(message, kind) {
    els.banner.hidden = false;
    els.banner.className = 'banner banner-' + (kind === 'error' ? 'error' : 'preview');
    els.bannerText.textContent = message;
    els.retry.hidden = kind !== 'error';
    els.banner.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  }

  function hideBanner() {
    els.banner.hidden = true;
    els.bannerText.textContent = '';
    els.retry.hidden = true;
  }

  function showFieldError(field, message) {
    if (field === 'slotId') {
      showBanner(message || 'Choose a time first.', 'error');
      document.getElementById('times').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    var err = document.getElementById(field + '-error');
    if (err) err.textContent = message;
    var input = document.getElementById(field);
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    if (field === 'store') {
      var checked = document.querySelector('input[name="store"]:checked') || document.querySelector('input[name="store"]');
      if (checked) checked.focus();
    }
  }

  function clearField(field) {
    var err = document.getElementById(field + '-error');
    if (err) err.textContent = '';
    var input = document.getElementById(field);
    if (input) input.removeAttribute('aria-invalid');
  }

  function clearErrors() {
    ['name', 'phone', 'email', 'store'].forEach(clearField);
  }

  function syncStores() {
    document.querySelectorAll('.store').forEach(function (label) {
      var input = label.querySelector('input');
      label.classList.toggle('is-selected', !!(input && input.checked));
    });
  }

  function setBusy(busy) {
    state.busy = busy;
    els.submit.disabled = busy;
    els.submit.setAttribute('aria-busy', busy ? 'true' : 'false');
    if (busy) els.submit.textContent = 'Booking…';
    else updateSummary();
  }

  function parseService(text) {
    try {
      var data = JSON.parse(text);
      if (!data || typeof data !== 'object') throw new Error('bad');
      return data;
    } catch (err) {
      throw displayError('The booking link did not return interview times. In the sheet, open Extensions → Apps Script → Deploy → Manage deployments. Who has access must be Anyone, and the address must end in /exec. Open that address once and allow access if Google asks.');
    }
  }

  function displayError(message) {
    var err = new Error(message);
    return err;
  }

  function formatPhone(value) {
    var digits = String(value || '').replace(/\D/g, '');
    if (digits.length === 11 && digits.charAt(0) === '1') digits = digits.slice(1);
    if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return '';
    return '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
  }

  function formatMinutes(mins) {
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    var ap = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return h12 + ':' + pad2(m) + ' ' + ap;
  }

  function timeRange(startMin, endMin) {
    var start = formatMinutes(startMin);
    var end = formatMinutes(endMin);
    var same = start.slice(-2) === end.slice(-2);
    var clock = same ? start.slice(0, start.length - 3) + '–' + end : start + '–' + end;
    return clock + ' Central';
  }

  function weekdayIndex(ymd) {
    var p = ymd.split('-');
    return new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0)).getUTCDay();
  }

  function dayLabel(ymd) {
    var p = ymd.split('-');
    return WEEKDAYS[weekdayIndex(ymd)] + ', ' + MONTHS[Number(p[1]) - 1] + ' ' + Number(p[2]);
  }

  function whenLabel(ymd) {
    return dayLabel(ymd) + ', ' + ymd.slice(0, 4);
  }

  function dayNumber(ymd) {
    return Number(ymd.split('-')[2]);
  }

  function shortDow(ymd) {
    return DOW_SHORT[weekdayIndex(ymd)];
  }

  function pad2(n) {
    n = String(n);
    return n.length < 2 ? '0' + n : n;
  }

  function groupLabel(textValue) {
    var p = document.createElement('p');
    p.className = 'group-label';
    p.textContent = textValue;
    return p;
  }

  function paragraph(textValue, className) {
    var p = document.createElement('p');
    if (className) p.className = className;
    p.textContent = textValue;
    return p;
  }

  function text(id, value) {
    var node = document.getElementById(id);
    if (node) node.textContent = value || '';
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
