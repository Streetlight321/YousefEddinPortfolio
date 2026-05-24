(function () {
  const selectEl = document.getElementById('student-select');
  const btn = document.getElementById('check-in-btn');
  const btnLabel = document.getElementById('btn-label');
  const confirmationEl = document.getElementById('confirmation');
  const errorEl = document.getElementById('error-msg');

  let tomSelect = null;
  let studentsById = new Map();

  function showError(msg) {
    errorEl.textContent = msg;
  }

  function clearError() {
    errorEl.textContent = '';
  }

  function setLoading(isLoading) {
    if (isLoading) {
      btn.disabled = true;
      btnLabel.textContent = '';
      const spinner = document.createElement('span');
      spinner.className = 'spinner';
      spinner.setAttribute('aria-hidden', 'true');
      btnLabel.appendChild(spinner);
    } else {
      btnLabel.textContent = 'Check In';
    }
  }

  function fullName(student) {
    return `${(student.firstName || '').trim()} ${(student.lastName || '').trim()}`.trim();
  }

  async function loadStudents() {
    try {
      const res = await fetch('/api/students');
      if (!res.ok) throw new Error('Failed to load students');
      const students = await res.json();

      const options = students.map((s) => {
        const name = fullName(s);
        studentsById.set(String(s.id), name);
        return { value: String(s.id), text: name };
      });

      tomSelect = new TomSelect(selectEl, {
        options,
        placeholder: 'Start typing your name...',
        maxItems: 1,
        maxOptions: 500,
        create: false,
        sortField: { field: 'text', direction: 'asc' },
        searchField: ['text'],
        onChange: (value) => {
          btn.disabled = !value;
          clearError();
        }
      });
    } catch (err) {
      showError('Could not load student list. Please refresh the page.');
    }
  }

  async function handleCheckIn() {
    const id = tomSelect && tomSelect.getValue();
    if (!id) return;

    const name = studentsById.get(String(id));

    clearError();
    confirmationEl.textContent = '';
    setLoading(true);

    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name })
      });

      if (!res.ok) throw new Error('Check-in failed');

      const data = await res.json().catch(() => ({}));
      if (data && data.success === false) {
        throw new Error('Check-in failed');
      }

      confirmationEl.textContent = `✓ Welcome, ${name}! You're checked in.`;

      setTimeout(() => {
        confirmationEl.textContent = '';
        if (tomSelect) {
          tomSelect.clear();
          tomSelect.blur();
        }
        btn.disabled = true;
      }, 4000);
    } catch (err) {
      showError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  btn.addEventListener('click', handleCheckIn);
  loadStudents();
})();
