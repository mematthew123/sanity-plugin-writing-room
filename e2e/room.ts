import {expect, type Locator, type Page} from '@playwright/test'
import {type TestPost} from './fixtures'

/** The Studio scopes a tool's query to the tool: `?writing-room[view]=details`. */
export function detailsQuery(field?: string): string {
  return `?writing-room[view]=details${field ? `&writing-room[field]=${field}` : ''}`
}

/** Matches an address that is in Details, at `field` if one is given. */
export function inDetails(field?: string): RegExp {
  return new RegExp(`writing-room(\\[|%5B)view(\\]|%5D)=details${field ? `.*=${field}$` : ''}`)
}

/** The room, as the Writer finds their way around it. */
export class Room {
  readonly title: Locator
  readonly body: Locator
  readonly detailsButton: Locator
  readonly details: Locator
  readonly back: Locator
  readonly scroller: Locator

  constructor(readonly page: Page) {
    this.title = page.getByRole('textbox', {name: 'Title'})
    this.body = page.getByRole('textbox', {name: 'Body'})
    this.detailsButton = page.getByRole('button', {name: 'Details', exact: true})
    this.details = page.locator('[data-calm-details]')
    this.back = page.getByRole('button', {name: 'Back to writing'})
    this.scroller = page.locator('[data-calm-surface]')
  }

  async open(post: TestPost, search = '') {
    await this.page.goto(`${post.roomPath}${search}`)
    await expect(this.title).toHaveValue(post.title, {timeout: 45_000})
  }

  async openDetails() {
    await this.detailsButton.click()
    await expect(this.details).toBeVisible()
  }

  /** One of the room's own fields in Details, by its schema name. */
  field(name: string): Locator {
    return this.page.locator(`[data-calm-details-field="${name}"]`)
  }

  async scrollTop(): Promise<number> {
    return this.scroller.evaluate((element) => element.scrollTop)
  }
}
