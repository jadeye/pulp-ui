import { msg, t } from '@lingui/core/macro';
import {
  DebianDistributionAPI,
  DebianRepositoryAPI,
  type DebianRepositoryType,
} from '../../api';
import { Page, RepositoryForm } from '../../components';
import { Paths, formatPath } from '../../paths';
import { parsePulpIDFromURL, taskAlert } from '../../utilities';

const initialRepository: DebianRepositoryType = {
  name: '',
  description: '',
  retain_repo_versions: 1,
  pulp_labels: {},
  remote: ''
};

const DebianRepositoryEdit = Page<DebianRepositoryType>({
  breadcrumbs: ({ name }) =>
    [
      { url: formatPath(Paths.debian.repository.list), name: t`Repositories` },
      name && {
        url: formatPath(Paths.debian.repository.detail, { name }),
        name,
      },
      name ? { name: t`Edit` } : { name: t`Add` },
    ].filter(Boolean),

  displayName: 'DebianRepositoryEdit',
  errorTitle: msg`Repository could not be displayed.`,
  listUrl: formatPath(Paths.debian.repository.list),
  query: ({ name }) => {
    return DebianRepositoryAPI.list({ name })
      .then(({ data: { results } }) => {
        return results[0]
      })
      .then((repository) => {
        console.log(repository)
        return DebianRepositoryAPI.myPermissions(
          parsePulpIDFromURL(repository.pulp_href),
        )
          .then(({ data: { permissions } }) => permissions)
          .catch((e) => {
            console.error(e);
            return [];
          })
          .then((my_permissions) => ({ ...repository, my_permissions }));
      });
  },

  title: ({ name }) => name || t`Add new repository`,
  transformParams: ({ name, ...rest }) => ({
    ...rest,
    name: name !== '_' ? name : null,
  }),

  render: (item, { navigate, queueAlert, state, setState }) => {
    if (!state.repositoryToEdit) {
      const repositoryToEdit = {
        ...initialRepository,
        ...item,
      };
      setState({ repositoryToEdit, errorMessages: {} });
    }

    const { repositoryToEdit, errorMessages } = state;
    if (!repositoryToEdit) {
      return null;
    }

    const saveRepository = ({ createDistribution }) => {
      const { repositoryToEdit } = state;

      const data = { ...repositoryToEdit };

      // prevent "This field may not be blank." for nullable fields
      Object.keys(data).forEach((k) => {
        if (data[k] === '') {
          data[k] = null;
        }
      });

      if (item) {
        delete data.last_sync_task;
        delete data.last_synced_metadata_time;
        delete data.latest_version_href;
        delete data.pulp_created;
        delete data.pulp_href;
        delete data.versions_href;
      }

      delete data.my_permissions;

      data.pulp_labels ||= {};

      let promise = !item
        ? DebianRepositoryAPI.create(data).then(({ data: newData }) => {
            queueAlert({
              variant: 'success',
              title: t`Successfully created repository ${data.name}`,
            });

            return newData.pulp_href;
          })
        : DebianRepositoryAPI.update(
            parsePulpIDFromURL(item.pulp_href),
            data,
          ).then(({ data: task }) => {
            queueAlert(
              taskAlert(task, t`Update started for repository ${data.name}`),
            );

            return item.pulp_href;
          });

      if (createDistribution) {
        // only alphanumerics, slashes, underscores and dashes are allowed in base_path, transform anything else to _
        const basePathTransform = (name) =>
          name.replaceAll(/[^-a-zA-Z0-9_/]/g, '_');
        let distributionName = data.name;

        promise = promise
          .then((pulp_href) =>
            DebianDistributionAPI.create({
              name: distributionName,
              base_path: basePathTransform(distributionName),
              repository: pulp_href,
            }).catch(() => {
              // if distribution already exists, try a numeric suffix to name & base_path
              distributionName =
                data.name + Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
              return DebianDistributionAPI.create({
                name: distributionName,
                base_path: basePathTransform(distributionName),
                repository: pulp_href,
              });
            }),
          )
          .then(({ data: task }) =>
            queueAlert(
              taskAlert(
                task,
                t`Creation started for distribution ${distributionName}`,
              ),
            ),
          );
      }

      promise
        .then(() => {
          setState({
            errorMessages: {},
            repositoryToEdit: undefined,
          });

          navigate(
            formatPath(Paths.debian.repository.detail, {
              name: data.name,
            }),
          );
        })
        .catch(({ response: { data } }) =>
          setState({
            errorMessages: {
              __nofield: data.non_field_errors || data.detail,
              ...data,
            },
          }),
        );
    };

    const closeModal = () => {
      setState({ errorMessages: {}, repositoryToEdit: undefined });
      navigate(
        item
          ? formatPath(Paths.debian.repository.detail, {
              name: item.name,
            })
          : formatPath(Paths.debian.repository.list),
      );
    };

    return (
      <RepositoryForm
        allowEditName={!item}
        errorMessages={errorMessages}
        onCancel={closeModal}
        onSave={saveRepository}
        plugin='debian'
        repository={repositoryToEdit}
        updateRepository={(r) => setState({ repositoryToEdit: r })}
      />
    );
  },
});

export default DebianRepositoryEdit;
