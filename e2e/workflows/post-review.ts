import {
  defineAction,
  defineActivity,
  defineField,
  defineGuard,
  defineStage,
  defineTransition,
  defineWorkflow,
} from '@sanity/workflows/define'

/**
 * For the dev Studio only: a review with a hold, so the room can be tried against a real workflow.
 * Drafting can be published from; Review holds publishing and deleting until an editor approves.
 * Deployed with `pnpm workflows:deploy` (see sanity.workflow.ts); never shipped with the plugin.
 */
export const postReview = defineWorkflow({
  name: 'post-review',
  title: 'Post review',
  description: 'Takes one Post or Field Note from drafting, through a review that holds it, to approved.',
  initialStage: 'drafting',
  fields: [
    defineField({
      type: 'subject',
      name: 'subject',
      title: 'Post',
      required: true,
      types: ['post', 'fieldNote'],
      initialValue: {type: 'input'},
    }),
  ],
  stages: [
    defineStage({
      name: 'drafting',
      title: 'Drafting',
      activities: [
        defineActivity({
          name: 'write',
          title: 'Write it',
          actions: [defineAction({name: 'submit', title: 'Submit for review', status: 'done'})],
        }),
      ],
      transitions: [defineTransition({name: 'to-review', title: 'Send to review', to: 'review'})],
    }),
    defineStage({
      name: 'review',
      title: 'Review',
      guards: [
        defineGuard({
          name: 'hold-publishing',
          title: 'No publishing during review',
          description: 'An editor is reading it',
          match: {idRefs: [{type: 'fieldRead', field: 'subject'}], actions: ['publish']},
        }),
        defineGuard({
          name: 'hold-deleting',
          title: 'No deleting during review',
          match: {idRefs: [{type: 'fieldRead', field: 'subject'}], actions: ['delete']},
        }),
      ],
      activities: [
        defineActivity({
          name: 'sign-off',
          title: 'Read it',
          actions: [defineAction({name: 'approve', title: 'Approve', status: 'done'})],
        }),
      ],
      transitions: [defineTransition({name: 'to-approved', title: 'Approve and finish', to: 'approved'})],
    }),
    defineStage({name: 'approved', title: 'Approved'}),
  ],
})
