import {
  registerDecorator,
  type ValidationOptions,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'isIanaTimezone', async: false })
export class IsIanaTimezoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || value.trim() === '') {
      return false;
    }

    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value }).format();

      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return 'timezone must be a valid IANA timezone';
  }
}

export function IsIanaTimezone(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (object: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isIanaTimezone',
      target: object.constructor,
      propertyName: propertyName.toString(),
      options: validationOptions,
      validator: IsIanaTimezoneConstraint,
    });
  };
}
