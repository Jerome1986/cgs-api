import { AppController } from './app.controller'

describe('AppController', () => {
  it('returns health information', () => {
    expect(new AppController().health()).toEqual({ name: 'nest-model', status: 'ok' })
  })
})
