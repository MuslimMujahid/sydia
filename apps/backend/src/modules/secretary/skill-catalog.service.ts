import { Injectable, Logger } from '@nestjs/common';
import {
  defaultSkillDirectory,
  loadSkillCatalog,
  renderSkillCatalog,
  type SkillDefinition,
} from './skill-catalog';

/** Loads the repository skill catalog once at startup; invalid resources fail bootstrap. */
@Injectable()
export class SkillCatalogService {
  private readonly logger = new Logger(SkillCatalogService.name);
  readonly skills: readonly SkillDefinition[];
  readonly catalogPrompt: string;

  constructor() {
    this.skills = loadSkillCatalog(defaultSkillDirectory());
    this.catalogPrompt = renderSkillCatalog(this.skills);
    this.logger.log(
      `Skill catalog loaded: ${this.skills.map((skill) => `${skill.name}@${skill.version}`).join(', ')}`,
    );
  }

  /** Cross-checks declared tools once every tool is registered. */
  validateTools(registered: readonly string[]): void {
    loadSkillCatalog(defaultSkillDirectory(), registered);
  }
}
