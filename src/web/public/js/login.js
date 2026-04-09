const form = document.getElementById('login-form');
const errorBox = document.getElementById('login-error');

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.hidden = true;

  const formData = new FormData(form);
  const payload = {
    username: formData.get('username'),
    password: formData.get('password'),
  };

  try {
    const csrfToken = window.__CSRF_TOKEN;
    if (!csrfToken) {
      throw new Error('CSRF token manquant. Rechargez la page, puis réessayez. Si le problème persiste, videz les cookies de session.');
    }

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'Connexion impossible');
    }

    window.location.href = '/dashboard';
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  }
});
