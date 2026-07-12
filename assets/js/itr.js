document.addEventListener('DOMContentLoaded', () => {

  // Auto-generate a record number placeholder (replace with real ID from your backend/database)
  const recordNoField = document.getElementById('recordNo');
  const today = new Date();
  const y = today.getFullYear();
  const stamp = String(today.getTime()).slice(-5);
  recordNoField.value = `ABTC-${y}-${stamp}`;

  // Pill-group (single-select and multi-select) handling
  document.querySelectorAll('.pill-group').forEach((group) => {
    const isMulti = group.classList.contains('multi');
    group.querySelectorAll('.pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        if (isMulti) {
          pill.classList.toggle('active');
        } else {
          group.querySelectorAll('.pill').forEach((p) => p.classList.remove('active'));
          pill.classList.add('active');
        }
      });
    });
  });

  function getPillValue(name) {
    const group = document.querySelector(`.pill-group[data-name="${name}"]`);
    const active = group.querySelector('.pill.active');
    return active ? active.dataset.value : '';
  }

  function getPillValues(name) {
    const group = document.querySelector(`.pill-group[data-name="${name}"]`);
    return Array.from(group.querySelectorAll('.pill.active')).map((p) => p.dataset.value);
  }

  // Show "specify animal" field only when "Other" is selected
  const animalType = document.getElementById('animalType');
  const animalOtherWrap = document.getElementById('animalOtherWrap');
  animalType.addEventListener('change', () => {
    animalOtherWrap.hidden = animalType.value !== 'Other';
  });

  // Photo upload: click, drag-drop, and preview
  const uploadBox = document.getElementById('uploadBox');
  const woundPhoto = document.getElementById('woundPhoto');
  const uploadPrompt = document.getElementById('uploadPrompt');
  const uploadPreviewWrap = document.getElementById('uploadPreviewWrap');
  const uploadPreview = document.getElementById('uploadPreview');
  const removePhoto = document.getElementById('removePhoto');

  uploadBox.addEventListener('click', (e) => {
    if (e.target.closest('.remove-photo')) return;
    woundPhoto.click();
  });

  woundPhoto.addEventListener('change', () => {
    const file = woundPhoto.files[0];
    if (file) showPreview(file);
  });

  uploadBox.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadBox.classList.add('dragover');
  });

  uploadBox.addEventListener('dragleave', () => {
    uploadBox.classList.remove('dragover');
  });

  uploadBox.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadBox.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      woundPhoto.files = e.dataTransfer.files;
      showPreview(file);
    }
  });

  function showPreview(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      uploadPreview.src = e.target.result;
      uploadPrompt.hidden = true;
      uploadPreviewWrap.hidden = false;
    };
    reader.readAsDataURL(file);
  }

  removePhoto.addEventListener('click', (e) => {
    e.stopPropagation();
    woundPhoto.value = '';
    uploadPreview.src = '';
    uploadPrompt.hidden = false;
    uploadPreviewWrap.hidden = true;
  });

  // Reset form
  document.getElementById('resetBtn').addEventListener('click', () => {
    document.getElementById('itrForm').reset();
    document.querySelectorAll('.pill.active').forEach((p) => p.classList.remove('active'));
    animalOtherWrap.hidden = true;
    uploadPreview.src = '';
    uploadPrompt.hidden = false;
    uploadPreviewWrap.hidden = true;
  });

  // Submit: gather all data into a single object, ready to send to your backend
  document.getElementById('itrForm').addEventListener('submit', (e) => {
    e.preventDefault();

    const form = e.target;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const record = {
      recordNo: recordNoField.value,
      exposureDate: document.getElementById('exposureDate').value,
      consultDateTime: document.getElementById('consultDateTime').value,
      patient: {
        fullName: document.getElementById('fullName').value,
        age: document.getElementById('age').value,
        sex: document.getElementById('sex').value,
        contactNo: document.getElementById('contactNo').value,
        address: document.getElementById('address').value,
        physician: document.getElementById('physician').value,
      },
      exposure: {
        biteArea: document.getElementById('biteArea').value,
        animalType: animalType.value === 'Other' ? document.getElementById('animalOther').value : animalType.value,
        animalCaged: getPillValue('animalCaged'),
        exposureCategory: getPillValue('exposureCategory'),
        priorVaccination: getPillValue('priorVaccination'),
        lastVaccDate: document.getElementById('lastVaccDate').value,
      },
      vitalSigns: {
        bp: document.getElementById('bp').value,
        temp: document.getElementById('temp').value,
        pulse: document.getElementById('pulse').value,
        resp: document.getElementById('resp').value,
        o2sat: document.getElementById('o2sat').value,
        weight: document.getElementById('weight').value,
      },
      medicalHistory: {
        comorbidities: document.getElementById('comorbidities').value,
        allergies: document.getElementById('allergies').value,
        medications: document.getElementById('medications').value,
      },
      management: {
        woundCare: document.getElementById('woundCare').value,
        vaccineBrand: document.getElementById('vaccineBrand').value,
        route: document.getElementById('route').value,
        immunoglobulin: document.getElementById('immunoglobulin').value,
        vaccSchedule: getPillValues('vaccSchedule'),
        remarks: document.getElementById('remarks').value,
      },
      woundPhotoFile: woundPhoto.files[0] ? woundPhoto.files[0].name : null,
    };

    // TODO: replace this with your actual save logic, e.g.:
    // fetch('/api/itr', { method: 'POST', body: JSON.stringify(record) })
    console.log('Individual Treatment Record submitted:', record);
    alert('Treatment record captured. Check the browser console for the data object — connect this to your backend to save it for real.');
  });

});
