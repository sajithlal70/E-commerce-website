// Validation rules and messages
const validationRules = {
    name: {
        required: true,
        minLength: 3,
        pattern: /^[a-zA-Z]+(?: [a-zA-Z]+)*$/,  // Only letters with single spaces between words
        messages: {
            required: 'Name is required',
            minLength: 'Name must be at least 3 characters',
            pattern: 'Name should contain only letters (spaces between words allowed)'
        }
    },
    phone: {
        required: true,
        pattern: /^[6-9]\d{9}$/,  // Indian mobile number format starting with 6-9
        messages: {
            required: 'Phone number is required',
            pattern: 'Please enter a valid 10-digit mobile number'
        }
    },
    postalCode: {
        required: true,
        pattern: /^[1-9][0-9]{5}$/,  // Indian postal code format (not starting with 0)
        messages: {
            required: 'Postal code is required',
            pattern: 'Please enter a valid 6-digit postal code'
        }
    },
    street: {
        required: true,
        minLength: 5,
        pattern: /^[a-zA-Z0-9\s,.-]+$/,  // Allow letters, numbers, spaces, commas, dots, and hyphens
        messages: {
            required: 'Street address is required',
            minLength: 'Street address must be at least 5 characters',
            pattern: 'Please enter a valid street address'
        }
    },
    city: {
        required: true,
        minLength: 2,
        pattern: /^[a-zA-Z]+(?: [a-zA-Z]+)*$/,  // Only letters with single spaces between words
        messages: {
            required: 'City is required',
            minLength: 'City must be at least 2 characters',
            pattern: 'City should contain only letters (spaces between words allowed)'
        }
    }
};

// Validation helper functions
function validateField(field, value) {
    const rules = validationRules[field];
    if (!rules) return { isValid: true };

    // Trim the value and handle empty check
    const trimmedValue = value.trim();
    
    if (rules.required && !trimmedValue) {
        return {
            isValid: false,
            message: rules.messages.required
        };
    }

    // Skip other validations if field is empty and not required
    if (!trimmedValue && !rules.required) {
        return { isValid: true };
    }

    if (rules.minLength && trimmedValue.length < rules.minLength) {
        return {
            isValid: false,
            message: rules.messages.minLength
        };
    }

    if (rules.pattern && !rules.pattern.test(trimmedValue)) {
        return {
            isValid: false,
            message: rules.messages.pattern
        };
    }

    return { isValid: true };
}

function showFieldError(input, message) {
    const parent = input.closest('.input-group');
    clearFieldValidation(input);
    
    input.classList.add('border-red-500');
    input.classList.remove('border-green-500');
    
    // Add error icon with tooltip
    const iconWrapper = document.createElement('div');
    iconWrapper.className = 'validation-icon-wrapper relative';
    
    const icon = document.createElement('i');
    icon.className = 'fas fa-exclamation-circle text-red-500 validation-icon cursor-help';
    icon.title = message;
    
    iconWrapper.appendChild(icon);
    parent.appendChild(iconWrapper);
    
    // Add error message with animation
    const errorDiv = document.createElement('div');
    errorDiv.className = 'validation-message text-red-500 text-sm mt-1 ml-1 opacity-0 transform -translate-y-2';
    errorDiv.textContent = message;
    parent.appendChild(errorDiv);

    // Trigger animation
    requestAnimationFrame(() => {
        errorDiv.classList.add('transition-all', 'duration-300', 'opacity-100', 'translate-y-0');
    });
}

function showFieldSuccess(input) {
    const parent = input.closest('.input-group');
    clearFieldValidation(input);
    
    input.classList.remove('border-red-500');
    input.classList.add('border-green-500');
    
    const icon = document.createElement('i');
    icon.className = 'fas fa-check-circle text-green-500 validation-icon';
    parent.appendChild(icon);
}

function clearFieldValidation(input) {
    const parent = input.closest('.input-group');
    const icon = parent.querySelector('.validation-icon-wrapper, .validation-icon');
    const message = parent.querySelector('.validation-message');
    
    if (icon) icon.remove();
    if (message) {
        message.classList.add('opacity-0', '-translate-y-2');
        setTimeout(() => message.remove(), 300);
    }
    
    input.classList.remove('border-red-500', 'border-green-500');
}

function validateForm(formData) {
    const errors = [];
    
    // Validate address type first
    const addressType = formData.get('addressType');
    if (!addressType) {
        errors.push('Please select an address type');
    }
    
    // Validate other fields
    for (const [field, value] of formData.entries()) {
        if (field === 'addressType') continue; // Skip as already validated
        
        if (validationRules[field]) {
            const validation = validateField(field, value);
            if (!validation.isValid) {
                errors.push(validation.message);
            }
        }
    }
    
    return errors;
}

// Format input values
function formatInput(input) {
    const field = input.name;
    let value = input.value;

    switch (field) {
        case 'phone':
            // Remove non-digits and limit to 10 digits
            value = value.replace(/\D/g, '').slice(0, 10);
            break;
        case 'postalCode':
            // Remove non-digits and limit to 6 digits
            value = value.replace(/\D/g, '').slice(0, 6);
            break;
        case 'name':
        case 'city':
            // Remove multiple spaces and special characters
            value = value.replace(/[^a-zA-Z\s]/g, '')
                        .replace(/\s+/g, ' ')
                        .trim();
            break;
        case 'street':
            // Remove multiple spaces and limit special characters
            value = value.replace(/\s+/g, ' ')
                        .replace(/[^a-zA-Z0-9\s,.-]/g, '')
                        .trim();
            break;
    }

    input.value = value;
}

// Export validation functions
window.addressValidation = {
    validateField,
    showFieldError,
    showFieldSuccess,
    clearFieldValidation,
    validateForm,
    formatInput
};

// Initialize form validation
document.addEventListener('DOMContentLoaded', () => {
    const forms = document.querySelectorAll('#addressForm, #editAddressForm');
    
    forms.forEach(form => {
        if (!form) return;

        const inputs = form.querySelectorAll('input[name]');
        
        inputs.forEach(input => {
            let formatTimeout;

            // Format and validate on input with debounce
            input.addEventListener('input', () => {
                clearTimeout(formatTimeout);
                formatTimeout = setTimeout(() => {
                    formatInput(input);
                    const validation = validateField(input.name, input.value);
                    if (!validation.isValid) {
                        showFieldError(input, validation.message);
                    } else {
                        showFieldSuccess(input);
                    }
                }, 300);
            });

            // Validate on blur
            input.addEventListener('blur', () => {
                formatInput(input);
                const validation = validateField(input.name, input.value);
                if (!validation.isValid) {
                    showFieldError(input, validation.message);
                } else {
                    showFieldSuccess(input);
                }
            });

            // Clear validation state on focus
            input.addEventListener('focus', () => {
                clearFieldValidation(input);
            });
        });
    });
}); 