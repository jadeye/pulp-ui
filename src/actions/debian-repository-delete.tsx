import { msg, t } from '@lingui/core/macro';
import { DebianDistributionAPI, DebianRepositoryAPI } from 'src/api';
import { DeleteRepositoryModal } from 'src/components';
import {
  handleHttpError,
  parsePulpIDFromURL,
  taskAlert,
  waitForTaskUrl,
} from 'src/utilities';
import { Action } from './action';

export const debianRepositoryDeleteAction = Action({
  title: msg`Delete`,
  modal: ({ addAlert, listQuery, setState, state }) =>
    state.deleteModalOpen ? (
      <DeleteRepositoryModal
        closeAction={() => setState({ deleteModalOpen: null })}
        deleteAction={() =>
          deleteRepository(state.deleteModalOpen, {
            addAlert,
            listQuery,
            setState,
          })
        }
        name={state.deleteModalOpen.name}
      />
    ) : null,
  onClick: (
    { name, id, pulp_href }: { name: string; id?: string; pulp_href?: string },
    { setState },
  ) =>
    setState({
      deleteModalOpen: {
        pulpId: id || parsePulpIDFromURL(pulp_href),
        name,
        pulp_href,
      },
    }),
});

async function deleteRepository(
  { name, pulp_href, pulpId },
  { addAlert, setState, listQuery },
) {
  // Fetch all distributions pointing to this repo
  const distributionsToDelete = await DebianDistributionAPI.list({
    repository: pulp_href,
    page: 1,
    page_size: 100,
  })
    .then(({ data: { results } }) => results || [])
    .catch((e) => {
      handleHttpError(
        t`Failed to list distributions, removing only the repository.`,
        () => null,
        addAlert,
      )(e);
      return [];
    });

  const deleteRepo = DebianRepositoryAPI.delete(pulpId)
    .then(({ data }) => {
      addAlert(taskAlert(data.task, t`Removal started for repository ${name}`));
      return waitForTaskUrl(data.task);
    })
    .catch(
      handleHttpError(
        t`Failed to remove repository ${name}`,
        () => setState({ deleteModalOpen: null }),
        addAlert,
      ),
    );

  const deleteDistribution = ({ name, pulp_href }) => {
    const distribution_id = parsePulpIDFromURL(pulp_href);
    return DebianDistributionAPI.delete(distribution_id)
      .then(({ data }) => {
        addAlert(
          taskAlert(data.task, t`Removal started for distribution ${name}`),
        );
        return waitForTaskUrl(data.task);
      })
      .catch(
        handleHttpError(
          t`Failed to remove distribution ${name}`,
          () => null,
          addAlert,
        ),
      );
  };

  return Promise.all([
    deleteRepo,
    ...distributionsToDelete.map(deleteDistribution),
  ]).then(() => {
    setState({ deleteModalOpen: null });
    listQuery();
  });
}
