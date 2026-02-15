exports.validatePassword = (password) => {
  const minLength = 16;
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).+$/;

  if (password.length < minLength) {
    return "Password must be at least 16 characters long.";
  }

  if (!regex.test(password)) {
    return "Password must include uppercase, lowercase, number, and symbol.";
  }

  return null;
};
