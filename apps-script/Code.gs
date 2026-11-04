/**
 * Varsa Group LLC — cashier interview booking
 * Chevron & OutRun stores, Hwy 43, Thomasville, AL
 *
 * Bound to the Google Sheet "Varsa Group LLC - Cashier Interview Schedule"
 * https://docs.google.com/spreadsheets/d/1rNQhs2MDWBIzEeoPyCwCr8gcTunLHLJpwCcxGxv69EI
 *
 * The web page calls doGet to list open times and doPost to book one.
 * Do not rename doGet, doPost, onOpen, checkHeaders, or seedSlotsIfEmpty.
 *
 * COLUMN LAYOUT THIS SCRIPT EXPECTS
 * (row 1 is the header; names must match; column order does not matter)
 *
 * Slots
 *   Slot ID | Date | Day | Start | End | Status | Booked By | Booking ID
 *   Status is "open" or "booked". An empty Status counts as open.
 *   One row per 20-minute interview. 105 rows: Mon Nov 9–Fri Nov 13 2026,
 *   9:00 AM–12:00 PM and 1:00 PM–5:00 PM Central. 12:00–1:00 PM is lunch.
 *
 * Bookings
 *   Booking ID | Slot ID | Date | Day | Start | End | Applicant Name | Phone
 *   | Email | Store Preference | Booked At | Calendar Event ID | Email Status | Status
 *
 * Schedule View and How it works are left untouched.
 *
 * Things you may edit (then deploy a new version):
 *   NOTIFY_EMAIL  — inbox that receives each new booking
 *   LOCATION      — short place name on the calendar event
 *   LOCATION_LINE — sentence shown to the applicant
 */

var api_ = (function () {
  var CONFIG = {
    VERSION: '1',
    COMPANY: 'Varsa Group LLC',
    NOTIFY_EMAIL: 'varun.shah@gmail.com',
    TIMEZONE: 'America/Chicago',
    LOCATION: 'Hwy 43, Thomasville, AL',
    LOCATION_LINE: 'Chevron and OutRun stores, Hwy 43, Thomasville, AL',
    SLOTS_TAB: 'Slots',
    BOOKINGS_TAB: 'Bookings',
    SCHEDULE_TAB: 'Schedule View',
    HELP_TAB: 'How it works'
  };

  var SLOT_HEADERS = [
    'Slot ID', 'Date', 'Day', 'Start', 'End', 'Status', 'Booked By', 'Booking ID'
  ];

  var BOOKING_HEADERS = [
    'Booking ID', 'Slot ID', 'Date', 'Day', 'Start', 'End', 'Applicant Name',
    'Phone', 'Email', 'Store Preference', 'Booked At', 'Calendar Event ID',
    'Email Status', 'Status'
  ];

  var FIELD_BY_HEADER = {
    'slot id': 'slotId',
    'date': 'date',
    'day': 'day',
    'start': 'start',
    'end': 'end',
    'status': 'status',
    'booked by': 'bookedBy',
    'booking id': 'bookingId',
    'applicant name': 'name',
    'phone': 'phone',
    'email': 'email',
    'store preference': 'store',
    'booked at': 'bookedAt',
    'calendar event id': 'calendarEventId',
    'email status': 'emailStatus'
  };

  var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  var TAKEN_MESSAGE = 'That time was just taken. Please pick another.';
  var STORES = { chevron: 'Chevron', outrun: 'OutRun', either: 'Either' };

  function doGet(e) {
    try {
      return json_(buildSlotPayload_());
    } catch (err) {
      return json_(errorPayload_(err));
    }
  }

  function doPost(e) {
    var outcome;
    var lock = LockService.getScriptLock();
    var locked = false;
    try {
      locked = lock.tryLock(20000);
      if (!locked) {
        outcome = {
          ok: false,
          code: 'BUSY',
          message: 'Someone else is booking right now. Wait a few seconds and try again.'
        };
      } else {
        outcome = reserve_(e);
      }
    } catch (err) {
      outcome = errorPayload_(err);
    } finally {
      if (locked) lock.releaseLock();
    }

    if (outcome && outcome.needsNotify) {
      var extra = notifySafe_(outcome.internal);
      outcome.emailSent = extra.emailSent;
      outcome.emailStatus = extra.emailStatus;
      outcome.calendarCreated = extra.calendarCreated;
      saveExtrasSafe_(outcome.bookingId, extra);
      delete outcome.needsNotify;
      delete outcome.internal;
    }

    return json_(outcome);
  }

  function onOpen() {
    SpreadsheetApp.getUi()
      .createMenu('Interview schedule')
      .addItem('Check column headers', 'checkHeaders')
      .addItem('Add 105 times if Slots is empty', 'seedSlotsIfEmpty')
      .addToUi();
  }

  function checkHeaders() {
    var lines = [];
    try {
      var ss = spreadsheet_();
      var tz = ss.getSpreadsheetTimeZone();
      if (tz === CONFIG.TIMEZONE || tz === 'US/Central' || tz === 'Canada/Central') {
        lines.push('Time zone: ' + tz + '. Good.');
      } else {
        lines.push('Time zone is ' + tz + '. Set File → Settings → Time zone to Central Time (America/Chicago).');
      }
      lines.push(inspectSheet_(CONFIG.SLOTS_TAB, SLOT_HEADERS, true));
      lines.push(inspectSheet_(CONFIG.BOOKINGS_TAB, BOOKING_HEADERS, false));
      lines.push(tabPresence_(ss, CONFIG.SCHEDULE_TAB));
      lines.push(tabPresence_(ss, CONFIG.HELP_TAB));
    } catch (err) {
      lines.push(err && err.message ? err.message : String(err));
    }
    alert_(lines.join('\n\n'));
  }

  function seedSlotsIfEmpty() {
    try {
      var ss = spreadsheet_();
      var sheet = ss.getSheetByName(CONFIG.SLOTS_TAB);
      if (!sheet) sheet = ss.insertSheet(CONFIG.SLOTS_TAB);

      var existing = countDataRows_(sheet);
      if (existing > 0) {
        alert_('Slots already has ' + existing + ' filled rows. Nothing was added and nothing was changed.');
        return;
      }

      if (sheet.getLastRow() > 0) {
        var missing = missingHeaders_(sheet, SLOT_HEADERS);
        if (missing.length) {
          alert_(
            'Row 1 of Slots does not match and the tab has no interview rows yet.\n\n' +
            'Missing: ' + missing.join(', ') + '\n\n' +
            'Expected header row:\n' + SLOT_HEADERS.join(' | ')
          );
          return;
        }
      } else {
        writeHeaders_(sheet, SLOT_HEADERS);
      }

      var plan = buildSlotPlan_();
      var width = Math.max(sheet.getLastColumn(), SLOT_HEADERS.length);
      var headers = sheet.getRange(1, 1, 1, width).getValues()[0];
      var rows = [];
      var i;
      for (i = 0; i < plan.length; i++) {
        var item = plan[i];
        var record = {
          slotId: slotIdFrom_(item.date, item.start),
          date: item.date,
          day: item.day,
          start: formatMinutes_(item.start),
          end: formatMinutes_(item.end),
          status: 'open',
          bookedBy: '',
          bookingId: ''
        };
        var row = [];
        var c;
        for (c = 0; c < headers.length; c++) {
          var field = FIELD_BY_HEADER[normalizeHeader_(headers[c])];
          row.push(field && record[field] != null ? record[field] : '');
        }
        rows.push(row);
      }

      sheet.getRange(2, 1, rows.length, width).setNumberFormat('@');
      sheet.getRange(2, 1, rows.length, width).setValues(rows);
      styleHeader_(sheet, width);
      sheet.setFrozenRows(1);
      sheet.autoResizeColumns(1, width);

      var statusCol = headerIndex_(sheet, SLOT_HEADERS).map.status + 1;
      var rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(['open', 'booked'], true)
        .setAllowInvalid(true)
        .build();
      sheet.getRange(2, statusCol, rows.length, 1).setDataValidation(rule);

      if (!sheet.getFilter()) {
        sheet.getRange(1, 1, rows.length + 1, width).createFilter();
      }

      alert_(
        'Added ' + rows.length + ' interview times.\n\n' +
        'Monday, November 9 through Friday, November 13, 2026.\n' +
        'Each interview is 20 minutes, 9:00 AM to 5:00 PM Central, with 12:00 to 1:00 PM left open for lunch.'
      );
    } catch (err) {
      alert_(err && err.message ? err.message : String(err));
    }
  }

  function buildSlotPayload_() {
    var ss = spreadsheet_();
    var sheet = ss.getSheetByName(CONFIG.SLOTS_TAB);
    if (!sheet) setup_('There is no tab named "Slots" in the spreadsheet.');
    var index = headerIndex_(sheet, SLOT_HEADERS);
    if (index.missing.length) setup_(missingMessage_('Slots', index.missing));

    var tz = ss.getSpreadsheetTimeZone() || CONFIG.TIMEZONE;
    var last = sheet.getLastRow();
    var days = {};
    var order = [];
    var total = 0;
    var openCount = 0;
    var unreadable = 0;
    var seen = {};

    if (last >= 2) {
      var values = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
      var r;
      for (r = 0; r < values.length; r++) {
        var parsed = parseSlotRow_(values[r], index, tz);
        if (!parsed) continue;
        if (parsed.unreadable) {
          unreadable++;
          continue;
        }
        total++;
        if (!days[parsed.date]) {
          days[parsed.date] = {
            date: parsed.date,
            day: WEEKDAYS[weekdayIndex_(parsed.date)],
            label: dayLabel_(parsed.date),
            slots: []
          };
          order.push(parsed.date);
        }
        if (!parsed.open) continue;
        if (parsed.past) continue;
        if (seen[parsed.id]) continue;
        seen[parsed.id] = true;
        openCount++;
        days[parsed.date].slots.push({
          id: parsed.id,
          start: parsed.startText,
          end: parsed.endText,
          startMinutes: parsed.startMinutes,
          endMinutes: parsed.endMinutes,
          label: timeRangeLabel_(parsed.startMinutes, parsed.endMinutes).replace(' Central', '')
        });
      }
    }

    order.sort();
    var dayList = [];
    var d;
    for (d = 0; d < order.length; d++) {
      var day = days[order[d]];
      day.slots.sort(function (a, b) { return a.startMinutes - b.startMinutes; });
      day.openCount = day.slots.length;
      dayList.push(day);
    }

    return {
      ok: true,
      version: CONFIG.VERSION,
      timezone: CONFIG.TIMEZONE,
      spreadsheetTimeZone: tz,
      location: CONFIG.LOCATION,
      locationLine: CONFIG.LOCATION_LINE,
      company: CONFIG.COMPANY,
      stores: ['Chevron', 'OutRun', 'Either'],
      openCount: openCount,
      totalCount: total,
      unreadableCount: unreadable,
      days: dayList
    };
  }

  function reserve_(e) {
    var body = parseBody_(e);
    var applicant = validateApplicant_(body);
    if (!applicant.ok) return applicant;

    var ss = spreadsheet_();
    var slotsSheet = ss.getSheetByName(CONFIG.SLOTS_TAB);
    if (!slotsSheet) setup_('There is no tab named "Slots" in the spreadsheet.');
    var slotIndex = headerIndex_(slotsSheet, SLOT_HEADERS);
    if (slotIndex.missing.length) setup_(missingMessage_('Slots', slotIndex.missing));

    var bookingsSheet = bookingsSheet_();
    var bookingIndex = headerIndex_(bookingsSheet, BOOKING_HEADERS);
    if (bookingIndex.missing.length) setup_(missingMessage_('Bookings', bookingIndex.missing));

    var tz = ss.getSpreadsheetTimeZone() || CONFIG.TIMEZONE;
    var found = findSlot_(slotsSheet, slotIndex, tz, applicant.slotId);
    if (!found) {
      return {
        ok: false,
        code: 'NOT_FOUND',
        message: 'That time is not on the schedule. Refresh the page and pick another.'
      };
    }

    var existing = findBookingByEmail_(bookingsSheet, bookingIndex, applicant.email);
    if (existing && existing.slotId === applicant.slotId) {
      return publicBooking_(existing, true);
    }
    if (existing) {
      return {
        ok: false,
        code: 'ALREADY_BOOKED',
        message: 'This email already has an interview booked. Each person can hold one time.',
        bookingId: existing.bookingId,
        name: existing.name,
        email: applicant.email,
        phone: existing.phone,
        store: existing.store,
        date: existing.date,
        day: existing.day,
        start: existing.start,
        end: existing.end,
        whenLabel: existing.whenLabel,
        timeLabel: existing.timeLabel,
        location: CONFIG.LOCATION,
        locationLine: CONFIG.LOCATION_LINE
      };
    }

    if (!found.open) {
      return { ok: false, code: 'SLOT_TAKEN', message: TAKEN_MESSAGE };
    }
    if (found.past) {
      return {
        ok: false,
        code: 'PAST',
        message: 'That time has already passed. Please pick another.'
      };
    }

    var bookingId = uniqueBookingId_(bookingsSheet, bookingIndex);
    var now = new Date();
    var record = {
      bookingId: bookingId,
      slotId: found.id,
      date: found.date,
      day: WEEKDAYS[weekdayIndex_(found.date)],
      start: found.startText,
      end: found.endText,
      name: applicant.name,
      phone: applicant.phone,
      email: applicant.email,
      store: applicant.store,
      bookedAt: Utilities.formatDate(now, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss'),
      calendarEventId: '',
      emailStatus: 'pending',
      status: 'confirmed'
    };

    markSlot_(slotsSheet, slotIndex, found.row, {
      status: 'booked',
      bookedBy: applicant.name,
      bookingId: bookingId
    });

    try {
      appendRecord_(bookingsSheet, record);
      SpreadsheetApp.flush();
    } catch (writeErr) {
      try {
        markSlot_(slotsSheet, slotIndex, found.row, { status: 'open', bookedBy: '', bookingId: '' });
        SpreadsheetApp.flush();
      } catch (rollbackErr) {
        console.error(rollbackErr);
      }
      throw writeErr;
    }

    console.log('Reserved ' + bookingId + ' for slot ' + found.id);

    var pub = publicBooking_(record, false);
    pub.needsNotify = true;
    pub.internal = {
      bookingId: bookingId,
      name: applicant.name,
      phone: applicant.phone,
      email: applicant.email,
      store: applicant.store,
      date: found.date,
      startMinutes: found.startMinutes,
      endMinutes: found.endMinutes,
      whenLabel: pub.whenLabel,
      timeLabel: pub.timeLabel,
      slotId: found.id
    };
    return pub;
  }

  function notifySafe_(info) {
    var calendarCreated = false;
    var calendarEventId = '';
    try {
      var event = createEvent_(info);
      calendarCreated = true;
      calendarEventId = event.getId();
    } catch (err) {
      console.error(err && err.stack ? err.stack : err);
    }

    var emailStatus = 'not sent';
    try {
      emailStatus = sendEmails_(info);
    } catch (err) {
      console.error(err && err.stack ? err.stack : err);
      emailStatus = isQuota_(err) ? 'not sent: daily email limit' : 'not sent';
    }

    return {
      calendarCreated: calendarCreated,
      calendarEventId: calendarEventId,
      emailStatus: emailStatus,
      emailSent: emailStatus.indexOf('sent') === 0
    };
  }

  function createEvent_(info) {
    var start = chicagoWallTime_(info.date, info.startMinutes);
    var end = chicagoWallTime_(info.date, info.endMinutes);
    var title = 'Interview: ' + oneLine_(info.name) + ' (Cashier)';
    var description = [
      'Cashier interview for ' + CONFIG.COMPANY + '.',
      CONFIG.LOCATION_LINE,
      '',
      'When: ' + info.whenLabel,
      'Time: ' + info.timeLabel,
      'Applicant: ' + info.name,
      'Phone: ' + info.phone,
      'Email: ' + info.email,
      'Store preference: ' + info.store,
      'Booking ID: ' + info.bookingId,
      'Slot: ' + info.slotId
    ].join('\n');

    var event = CalendarApp.getDefaultCalendar().createEvent(title, start, end, {
      description: description,
      location: CONFIG.LOCATION
    });

    try {
      var calId = String(CalendarApp.getDefaultCalendar().getId() || '').toLowerCase();
      addGuest_(event, info.email, calId);
      if (info.email.toLowerCase() !== CONFIG.NOTIFY_EMAIL.toLowerCase()) {
        addGuest_(event, CONFIG.NOTIFY_EMAIL, calId);
      }
      event.setGuestsCanSeeGuests(false);
    } catch (err) {
      console.error(err);
    }

    try {
      event.setColor(CalendarApp.EventColor.BLUE);
    } catch (err) {
      console.error(err);
    }

    return event;
  }

  function addGuest_(event, email, calendarOwnerId) {
    if (!email) return;
    if (String(email).toLowerCase() === calendarOwnerId) return;
    event.addGuest(email);
  }

  function sendEmails_(info) {
    var applicantMessage = applicantMail_(info);
    var applicantOk = false;
    var ownerOk = false;
    var quota = false;

    try {
      MailApp.sendEmail(applicantMessage);
      applicantOk = true;
    } catch (err) {
      if (isQuota_(err)) quota = true;
      console.error(err);
    }

    if (info.email.toLowerCase() === CONFIG.NOTIFY_EMAIL.toLowerCase()) {
      ownerOk = applicantOk;
    } else {
      try {
        MailApp.sendEmail(ownerMail_(info));
        ownerOk = true;
      } catch (err) {
        if (isQuota_(err)) quota = true;
        console.error(err);
      }
    }

    if (applicantOk && ownerOk) return 'sent';
    if (quota && !applicantOk) return 'not sent: daily email limit';
    if (applicantOk) return 'sent to applicant only';
    return 'not sent';
  }

  function applicantMail_(info) {
    var subject = 'Your cashier interview is booked — ' + CONFIG.COMPANY;
    var lines = [
      'Hi ' + info.name + ',',
      '',
      'Your cashier interview with ' + CONFIG.COMPANY + ' is booked.',
      '',
      'When: ' + info.whenLabel,
      'Time: ' + info.timeLabel,
      'Where: ' + CONFIG.LOCATION_LINE,
      'Store preference: ' + info.store,
      'Reference: ' + info.bookingId,
      '',
      'Please arrive a few minutes early and bring a photo ID. The interview takes about 20 minutes.',
      '',
      'To change or cancel, reply to this email.',
      '',
      CONFIG.COMPANY
    ];
    var body = lines.join('\n');
    return {
      to: info.email,
      replyTo: CONFIG.NOTIFY_EMAIL,
      name: CONFIG.COMPANY,
      subject: subject,
      body: body,
      htmlBody: htmlMail_(subject, info, false)
    };
  }

  function ownerMail_(info) {
    var subject = 'New cashier interview: ' + oneLine_(info.name) + ' — ' + info.whenLabel + ', ' + info.timeLabel;
    var body = [
      'A cashier interview was booked.',
      '',
      'Name: ' + info.name,
      'Phone: ' + info.phone,
      'Email: ' + info.email,
      'Store preference: ' + info.store,
      'When: ' + info.whenLabel,
      'Time: ' + info.timeLabel,
      'Where: ' + CONFIG.LOCATION_LINE,
      'Booking ID: ' + info.bookingId,
      'Slot ID: ' + info.slotId
    ].join('\n');
    return {
      to: CONFIG.NOTIFY_EMAIL,
      name: CONFIG.COMPANY,
      subject: oneLine_(subject),
      body: body,
      htmlBody: htmlMail_(subject, info, true)
    };
  }

  function htmlMail_(title, info, includeContact) {
    function row(label, value) {
      return '<tr><td style="padding:6px 12px 6px 0;color:#3e4a45;vertical-align:top;">' +
        escapeHtml_(label) + '</td><td style="padding:6px 0;font-weight:600;color:#1b2421;">' +
        escapeHtml_(value) + '</td></tr>';
    }
    var extra = '';
    if (includeContact) {
      extra = row('Phone', info.phone) + row('Email', info.email) + row('Slot', info.slotId);
    }
    return '' +
      '<div style="font-family:Georgia,serif;background:#f3efe4;padding:24px;">' +
      '<div style="max-width:560px;margin:0 auto;background:#fffcf6;border-radius:12px;overflow:hidden;">' +
      '<div style="background:#0a3f33;color:#f6f1e6;padding:20px 24px;font-size:20px;">' + escapeHtml_(CONFIG.COMPANY) + '</div>' +
      '<div style="padding:24px;font-family:Arial,sans-serif;font-size:16px;line-height:1.45;color:#1b2421;">' +
      '<p style="margin:0 0 12px;">' + escapeHtml_(title) + '</p>' +
      '<table style="border-collapse:collapse;">' +
      row('When', info.whenLabel) +
      row('Time', info.timeLabel) +
      row('Where', CONFIG.LOCATION_LINE) +
      row('Name', info.name) +
      row('Store preference', info.store) +
      row('Reference', info.bookingId) +
      extra +
      '</table>' +
      (includeContact
        ? '<p style="margin:16px 0 0;">This time is now marked booked on the Slots tab.</p>'
        : '<p style="margin:16px 0 0;">Please arrive a few minutes early and bring a photo ID. The interview takes about 20 minutes.</p>' +
          '<p style="margin:12px 0 0;">To change or cancel, reply to this email.</p>') +
      '</div></div></div>';
  }

  function parseBody_(e) {
    if (!e || !e.postData || !e.postData.contents) {
      return {};
    }
    if (e.postData.contents.length > 20000) {
      return { _tooLarge: true };
    }
    try {
      var parsed = JSON.parse(e.postData.contents);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
      return { _badJson: true };
    }
  }

  function validateApplicant_(body) {
    if (body && body._tooLarge) {
      return { ok: false, code: 'INVALID', message: 'That submission was too large.' };
    }
    if (body && body._badJson) {
      return { ok: false, code: 'INVALID', message: 'Could not read the form. Reload the page and try again.' };
    }
    body = body || {};

    var slotId = oneLine_(body.slotId);
    if (!slotId || slotId.length > 64 || !/^[\w.\-:]+$/.test(slotId)) {
      return { ok: false, code: 'INVALID', field: 'slotId', message: 'Choose a time first.' };
    }

    var name = String(body.name == null ? '' : body.name).replace(/\s+/g, ' ').trim();
    if (name.length < 2 || name.length > 80 || !/^[\p{L}][\p{L}\p{M} .'’-]+$/u.test(name)) {
      return {
        ok: false,
        code: 'INVALID',
        field: 'name',
        message: 'Enter your first and last name.'
      };
    }

    var phoneRaw = String(body.phone == null ? '' : body.phone);
    var digits = phoneRaw.replace(/\D/g, '');
    if (digits.length === 11 && digits.charAt(0) === '1') digits = digits.slice(1);
    if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) {
      return {
        ok: false,
        code: 'INVALID',
        field: 'phone',
        message: 'Enter a 10-digit phone number.'
      };
    }
    var phone = '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);

    var email = oneLine_(body.email).toLowerCase();
    if (email.length > 120 || !/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i.test(email)) {
      return {
        ok: false,
        code: 'INVALID',
        field: 'email',
        message: 'Enter a valid email address.'
      };
    }

    var store = STORES[oneLine_(body.store).toLowerCase()];
    if (!store) {
      return {
        ok: false,
        code: 'INVALID',
        field: 'store',
        message: 'Choose Chevron, OutRun, or Either.'
      };
    }

    return {
      ok: true,
      slotId: slotId,
      name: name,
      phone: phone,
      email: email,
      store: store
    };
  }

  function parseSlotRow_(row, index, tz) {
    var id = cell_(row, index, 'slotId');
    var dateRaw = cellRaw_(row, index, 'date');
    var startRaw = cellRaw_(row, index, 'start');
    if (!id && isBlank_(dateRaw) && isBlank_(startRaw)) return null;
    if (!id) return { unreadable: true };

    var date = asYmd_(dateRaw, tz);
    var startMinutes = timeMinutesFromValue_(startRaw, tz);
    if (!date || startMinutes < 0) return { unreadable: true };

    var endMinutes = timeMinutesFromValue_(cellRaw_(row, index, 'end'), tz);
    if (endMinutes < 0 || endMinutes <= startMinutes) endMinutes = startMinutes + 20;

    var past = false;
    try {
      past = chicagoWallTime_(date, startMinutes).getTime() <= Date.now();
    } catch (ignore) {}
    return {
      id: id,
      date: date,
      startMinutes: startMinutes,
      endMinutes: endMinutes,
      startText: formatMinutes_(startMinutes),
      endText: formatMinutes_(endMinutes),
      open: isOpenStatus_(cellRaw_(row, index, 'status')),
      past: past
    };
  }

  function findSlot_(sheet, index, tz, slotId) {
    var last = sheet.getLastRow();
    if (last < 2) return null;
    var values = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
    var booked = null;
    var r;
    for (r = 0; r < values.length; r++) {
      var id = cell_(values[r], index, 'slotId');
      if (id !== slotId) continue;
      var parsed = parseSlotRow_(values[r], index, tz);
      if (!parsed || parsed.unreadable) continue;
      parsed.row = r + 2;
      if (parsed.open && !parsed.past) return parsed;
      if (!booked) booked = parsed;
    }
    return booked;
  }

  function findBookingByEmail_(sheet, index, email) {
    var last = sheet.getLastRow();
    if (last < 2) return null;
    var values = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
    var target = email.toLowerCase();
    var r;
    for (r = values.length - 1; r >= 0; r--) {
      var rowEmail = cell_(values[r], index, 'email').toLowerCase();
      if (rowEmail !== target) continue;
      if (!isActiveBookingStatus_(cellRaw_(values[r], index, 'status'))) continue;
      return bookingFromRow_(values[r], index);
    }
    return null;
  }

  function bookingFromRow_(row, index) {
    var date = asYmd_(cellRaw_(row, index, 'date'), spreadsheet_().getSpreadsheetTimeZone() || CONFIG.TIMEZONE);
    var startText = cell_(row, index, 'start');
    var endText = cell_(row, index, 'end');
    var startMinutes = parseTimeText_(startText);
    var endMinutes = parseTimeText_(endText);
    var timeLabel = (startMinutes >= 0 && endMinutes >= 0)
      ? timeRangeLabel_(startMinutes, endMinutes)
      : (startText + '–' + endText + ' Central');
    return {
      bookingId: cell_(row, index, 'bookingId'),
      slotId: cell_(row, index, 'slotId'),
      date: date,
      day: date ? WEEKDAYS[weekdayIndex_(date)] : cell_(row, index, 'day'),
      start: startText,
      end: endText,
      name: cell_(row, index, 'name'),
      phone: cell_(row, index, 'phone'),
      email: cell_(row, index, 'email'),
      store: cell_(row, index, 'store'),
      whenLabel: date ? whenLabel_(date) : cell_(row, index, 'date'),
      timeLabel: timeLabel
    };
  }

  function publicBooking_(record, already) {
    var date = record.date;
    var startMinutes = record.startMinutes != null ? record.startMinutes : parseTimeText_(record.start);
    var endMinutes = record.endMinutes != null ? record.endMinutes : parseTimeText_(record.end);
    return {
      ok: true,
      code: 'BOOKED',
      alreadyHadBooking: !!already,
      bookingId: record.bookingId,
      slotId: record.slotId,
      name: record.name,
      email: record.email,
      phone: record.phone,
      store: record.store,
      date: date,
      day: record.day || (date ? WEEKDAYS[weekdayIndex_(date)] : ''),
      start: record.start || (startMinutes >= 0 ? formatMinutes_(startMinutes) : ''),
      end: record.end || (endMinutes >= 0 ? formatMinutes_(endMinutes) : ''),
      whenLabel: record.whenLabel || (date ? whenLabel_(date) : ''),
      timeLabel: record.timeLabel || (startMinutes >= 0 && endMinutes >= 0 ? timeRangeLabel_(startMinutes, endMinutes) : ''),
      location: CONFIG.LOCATION,
      locationLine: CONFIG.LOCATION_LINE,
      emailSent: false,
      emailStatus: already ? 'already sent' : 'pending',
      calendarCreated: !!already
    };
  }

  function markSlot_(sheet, index, rowNumber, fields) {
    setField_(sheet, index, rowNumber, 'status', fields.status);
    if (index.map.bookedBy != null && fields.bookedBy != null) {
      setField_(sheet, index, rowNumber, 'bookedBy', fields.bookedBy);
    }
    if (index.map.bookingId != null && fields.bookingId != null) {
      setField_(sheet, index, rowNumber, 'bookingId', fields.bookingId);
    }
  }

  function setField_(sheet, index, rowNumber, field, value) {
    var col = index.map[field];
    if (col == null) return;
    sheet.getRange(rowNumber, col + 1).setNumberFormat('@');
    sheet.getRange(rowNumber, col + 1).setValue(safeCell_(value));
  }

  function appendRecord_(sheet, record) {
    var width = Math.max(sheet.getLastColumn(), BOOKING_HEADERS.length);
    var headers = sheet.getRange(1, 1, 1, width).getValues()[0];
    var row = [];
    var i;
    for (i = 0; i < headers.length; i++) {
      var field = FIELD_BY_HEADER[normalizeHeader_(headers[i])];
      var value = field && record[field] != null ? record[field] : '';
      row.push(safeCell_(value));
    }
    var rowIndex = sheet.getLastRow() + 1;
    sheet.getRange(rowIndex, 1, 1, row.length).setNumberFormat('@');
    sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
    return rowIndex;
  }

  function saveExtrasSafe_(bookingId, extra) {
    try {
      var sheet = spreadsheet_().getSheetByName(CONFIG.BOOKINGS_TAB);
      if (!sheet) return;
      var index = headerIndex_(sheet, BOOKING_HEADERS);
      var last = sheet.getLastRow();
      if (last < 2) return;
      var values = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
      var r;
      for (r = values.length - 1; r >= 0; r--) {
        if (cell_(values[r], index, 'bookingId') !== bookingId) continue;
        setField_(sheet, index, r + 2, 'calendarEventId', extra.calendarEventId || '');
        setField_(sheet, index, r + 2, 'emailStatus', extra.emailStatus || '');
        return;
      }
    } catch (err) {
      console.error(err);
    }
  }

  function bookingsSheet_() {
    var ss = spreadsheet_();
    var sheet = ss.getSheetByName(CONFIG.BOOKINGS_TAB);
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.BOOKINGS_TAB);
      writeHeaders_(sheet, BOOKING_HEADERS);
      return sheet;
    }
    if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
      writeHeaders_(sheet, BOOKING_HEADERS);
    }
    return sheet;
  }

  function uniqueBookingId_(sheet, index) {
    var used = {};
    var last = sheet.getLastRow();
    if (last >= 2) {
      var values = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
      var i;
      for (i = 0; i < values.length; i++) {
        used[cell_(values[i], index, 'bookingId')] = true;
      }
    }
    var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var n;
    for (n = 0; n < 8; n++) {
      var id = 'VG-';
      var c;
      for (c = 0; c < 8; c++) {
        id += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
      }
      if (!used[id]) return id;
    }
    return 'VG-' + String(Date.now());
  }

  function headerIndex_(sheet, requiredHeaders) {
    var width = sheet.getLastColumn();
    var map = {};
    if (width > 0) {
      var headers = sheet.getRange(1, 1, 1, width).getValues()[0];
      var i;
      for (i = 0; i < headers.length; i++) {
        var field = FIELD_BY_HEADER[normalizeHeader_(headers[i])];
        if (field && map[field] == null) map[field] = i;
      }
    }
    var missing = [];
    var h;
    for (h = 0; h < requiredHeaders.length; h++) {
      var key = FIELD_BY_HEADER[normalizeHeader_(requiredHeaders[h])];
      if (map[key] == null) missing.push(requiredHeaders[h]);
    }
    return { map: map, missing: missing };
  }

  function missingHeaders_(sheet, requiredHeaders) {
    return headerIndex_(sheet, requiredHeaders).missing;
  }

  function writeHeaders_(sheet, headers) {
    sheet.getRange(1, 1, 1, headers.length).setNumberFormat('@');
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    styleHeader_(sheet, headers.length);
    sheet.setFrozenRows(1);
  }

  function styleHeader_(sheet, width) {
    var range = sheet.getRange(1, 1, 1, width);
    range.setFontWeight('bold');
    range.setBackground('#0a3f33');
    range.setFontColor('#f6f1e6');
  }

  function countDataRows_(sheet) {
    var last = sheet.getLastRow();
    var width = sheet.getLastColumn();
    if (last < 2 || width < 1) return 0;
    var values = sheet.getRange(2, 1, last - 1, width).getValues();
    var n = 0;
    var r;
    for (r = 0; r < values.length; r++) {
      var c;
      for (c = 0; c < values[r].length; c++) {
        if (!isBlank_(values[r][c])) {
          n++;
          break;
        }
      }
    }
    return n;
  }

  function inspectSheet_(name, requiredHeaders, countSlots) {
    var sheet = spreadsheet_().getSheetByName(name);
    if (!sheet) return name + ': missing. Add a tab with that exact name.';
    var missing = missingHeaders_(sheet, requiredHeaders);
    if (sheet.getLastRow() === 0) {
      return name + ': empty. Expected headers: ' + requiredHeaders.join(' | ');
    }
    if (missing.length) {
      return name + ': missing headers: ' + missing.join(', ') + '. Expected: ' + requiredHeaders.join(' | ');
    }
    if (!countSlots) {
      var bookings = Math.max(sheet.getLastRow() - 1, 0);
      return name + ': headers match. ' + bookings + ' booking row' + (bookings === 1 ? '' : 's') + '.';
    }
    var payload = buildSlotPayload_();
    var dupes = duplicateSlotIds_(sheet);
    var text = name + ': headers match. ' + payload.totalCount + ' times listed, ' + payload.openCount + ' open.';
    if (payload.unreadableCount) text += ' ' + payload.unreadableCount + ' row(s) could not be read.';
    if (dupes.length) text += ' Duplicate Slot IDs: ' + dupes.slice(0, 5).join(', ') + '.';
    return text;
  }

  function duplicateSlotIds_(sheet) {
    var index = headerIndex_(sheet, SLOT_HEADERS);
    var last = sheet.getLastRow();
    if (last < 2) return [];
    var values = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
    var seen = {};
    var dupes = [];
    var r;
    for (r = 0; r < values.length; r++) {
      var id = cell_(values[r], index, 'slotId');
      if (!id) continue;
      if (seen[id] && dupes.indexOf(id) === -1) dupes.push(id);
      seen[id] = true;
    }
    return dupes;
  }

  function tabPresence_(ss, name) {
    if (ss.getSheetByName(name)) {
      return name + ': found. This script does not change that tab.';
    }
    return name + ': missing. The booking page does not read it, but the sheet is expected to have this tab.';
  }

  function buildSlotPlan_() {
    var dates = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'];
    var expected = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    var starts = [];
    var m;
    for (m = 9 * 60; m < 12 * 60; m += 20) starts.push(m);
    for (m = 13 * 60; m < 17 * 60; m += 20) starts.push(m);
    if (starts.length !== 21) throw new Error('Expected 21 times per day, found ' + starts.length + '.');
    var plan = [];
    var d;
    for (d = 0; d < dates.length; d++) {
      var day = WEEKDAYS[weekdayIndex_(dates[d])];
      if (day !== expected[d]) throw new Error(dates[d] + ' is ' + day + ', not ' + expected[d] + '.');
      var s;
      for (s = 0; s < starts.length; s++) {
        plan.push({ date: dates[d], day: day, start: starts[s], end: starts[s] + 20 });
      }
    }
    if (plan.length !== 105) throw new Error('Expected 105 times, found ' + plan.length + '.');
    if (plan[0].start !== 9 * 60 || plan[20].start !== 16 * 60 + 40) {
      throw new Error('The first or last time of the day is wrong.');
    }
    return plan;
  }

  function chicagoWallTime_(ymd, minutes) {
    var parts = ymd.split('-');
    var y = Number(parts[0]);
    var mo = Number(parts[1]);
    var d = Number(parts[2]);
    var hh = Math.floor(minutes / 60);
    var mm = minutes % 60;
    var probe = new Date(Date.UTC(y, mo - 1, d, 16, 0, 0));
    var off = offsetMinutes_(probe, CONFIG.TIMEZONE);
    return new Date(Date.UTC(y, mo - 1, d, hh, mm) - off * 60000);
  }

  function offsetMinutes_(date, tz) {
    var z = Utilities.formatDate(date, tz, 'Z');
    var match = String(z).match(/^([+-])(\d{2}):?(\d{2})$/);
    if (!match) throw new Error('Could not read the Central time offset (' + z + ').');
    var sign = match[1] === '-' ? -1 : 1;
    return sign * (Number(match[2]) * 60 + Number(match[3]));
  }

  function asYmd_(value, tz) {
    if (value instanceof Date && !isNaN(value.getTime())) {
      return Utilities.formatDate(value, tz, 'yyyy-MM-dd');
    }
    var s = String(value == null ? '' : value).trim();
    if (!s) return '';
    var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
    var us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (us) return us[3] + '-' + pad2_(us[1]) + '-' + pad2_(us[2]);
    var formats = ['MMMM d, yyyy', 'MMM d, yyyy', 'M/d/yyyy', 'MM/dd/yyyy'];
    var i;
    for (i = 0; i < formats.length; i++) {
      try {
        var parsed = Utilities.parseDate(s, tz, formats[i]);
        if (parsed) return Utilities.formatDate(parsed, tz, 'yyyy-MM-dd');
      } catch (ignore) {}
    }
    return '';
  }

  function timeMinutesFromValue_(value, tz) {
    if (value instanceof Date && !isNaN(value.getTime())) {
      var h = Number(Utilities.formatDate(value, tz, 'H'));
      var m = Number(Utilities.formatDate(value, tz, 'm'));
      if (isNaN(h) || isNaN(m)) return -1;
      return h * 60 + m;
    }
    return parseTimeText_(String(value == null ? '' : value));
  }

  function parseTimeText_(value) {
    var s = String(value == null ? '' : value)
      .trim()
      .toLowerCase()
      .replace(/[\u00a0\u202f]/g, ' ')
      .replace(/\./g, '');
    var match = s.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm)?$/);
    if (!match) return -1;
    var h = Number(match[1]);
    var m = Number(match[2] || '0');
    var ap = match[3];
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (!ap && h <= 7) h += 12;
    if (h > 23 || m > 59) return -1;
    return h * 60 + m;
  }

  function formatMinutes_(mins) {
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    var ap = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return h12 + ':' + pad2_(m) + ' ' + ap;
  }

  function timeRangeLabel_(startMin, endMin) {
    var start = formatMinutes_(startMin);
    var end = formatMinutes_(endMin);
    var same = start.slice(-2) === end.slice(-2);
    var clock = same ? start.slice(0, start.length - 3) + '–' + end : start + '–' + end;
    return clock + ' Central';
  }

  function dayLabel_(ymd) {
    var p = ymd.split('-');
    return WEEKDAYS[weekdayIndex_(ymd)] + ', ' + MONTHS[Number(p[1]) - 1] + ' ' + Number(p[2]);
  }

  function whenLabel_(ymd) {
    return dayLabel_(ymd) + ', ' + ymd.slice(0, 4);
  }

  function weekdayIndex_(ymd) {
    var p = ymd.split('-');
    var dt = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0));
    return dt.getUTCDay();
  }

  function slotIdFrom_(ymd, minutes) {
    var hh = Math.floor(minutes / 60);
    var mm = minutes % 60;
    return ymd.replace(/-/g, '') + '-' + pad2_(hh) + pad2_(mm);
  }

  function isOpenStatus_(value) {
    if (value === true) return true;
    if (value === false) return false;
    var s = String(value == null ? '' : value).trim().toLowerCase();
    return s === '' || s === 'open' || s === 'available' || s === 'free';
  }

  function isActiveBookingStatus_(value) {
    var s = String(value == null ? '' : value).trim().toLowerCase();
    return s !== 'cancelled' && s !== 'canceled';
  }

  function cell_(row, index, field) {
    var value = cellRaw_(row, index, field);
    if (value instanceof Date) return Utilities.formatDate(value, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm');
    return String(value == null ? '' : value).trim();
  }

  function cellRaw_(row, index, field) {
    var col = index.map[field];
    if (col == null) return '';
    return row[col];
  }

  function isBlank_(value) {
    return String(value == null ? '' : value).trim() === '';
  }

  function normalizeHeader_(value) {
    return String(value == null ? '' : value).trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function safeCell_(value) {
    var s = String(value == null ? '' : value);
    if (/^[=+\-@]/.test(s)) return "'" + s;
    return s;
  }

  function oneLine_(value) {
    return String(value == null ? '' : value).replace(/[\r\n]+/g, ' ').trim();
  }

  function pad2_(n) {
    n = String(n);
    return n.length < 2 ? '0' + n : n;
  }

  function escapeHtml_(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isQuota_(err) {
    var s = String(err && err.message ? err.message : err).toLowerCase();
    return s.indexOf('quota') !== -1 || s.indexOf('limit') !== -1 || s.indexOf('too many') !== -1;
  }

  function spreadsheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      setup_('This script has to live inside the interview spreadsheet. Open that sheet, choose Extensions, then Apps Script, and paste the script there.');
    }
    return ss;
  }

  function setup_(message) {
    var err = new Error(message);
    err.code = 'NOT_SETUP';
    throw err;
  }

  function missingMessage_(tabName, missing) {
    var expected = tabName === 'Slots' ? SLOT_HEADERS : BOOKING_HEADERS;
    return 'The ' + tabName + ' tab is missing these column headers: ' + missing.join(', ') +
      '. Row 1 should include: ' + expected.join(' | ') + '. Column order does not matter.';
  }

  function errorPayload_(err) {
    if (err && err.code === 'NOT_SETUP') {
      return { ok: false, code: 'NOT_SETUP', message: String(err.message || 'The sheet is not ready yet.') };
    }
    console.error(err && err.stack ? err.stack : err);
    return {
      ok: false,
      code: 'ERROR',
      message: 'Something went wrong while saving the booking. Please try again.'
    };
  }

  function json_(obj) {
    return ContentService
      .createTextOutput(JSON.stringify(obj))
      .setMimeType(ContentService.MimeType.JSON);
  }

  function alert_(message) {
    console.log(message);
    try {
      SpreadsheetApp.getUi().alert(message);
    } catch (err) {
      // The execution log still has the message when no dialog is available.
    }
  }

  return {
    doGet: doGet,
    doPost: doPost,
    onOpen: onOpen,
    checkHeaders: checkHeaders,
    seedSlotsIfEmpty: seedSlotsIfEmpty
  };
})();

function doGet(e) { return api_.doGet(e); }
function doPost(e) { return api_.doPost(e); }
function onOpen() { api_.onOpen(); }
function checkHeaders() { api_.checkHeaders(); }
function seedSlotsIfEmpty() { api_.seedSlotsIfEmpty(); }
