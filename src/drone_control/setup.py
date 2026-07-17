from setuptools import find_packages, setup

package_name = 'drone_control'

setup(
    name=package_name,
    version='0.0.0',
    packages=find_packages(exclude=['test']),
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='abdul-rafi',
    maintainer_email='rafiabdul7128@gmail.com',
    description='TODO: Package description',
    license='TODO: License declaration',
    extras_require={
        'test': [
            'pytest',
        ],
    },
    entry_points={
        'console_scripts': [
            'mavlink_node = drone_control.mavlink_node:main',
            'capture_map = drone_control.capture_map:main',
            'sonar_depth_node = drone_control.sonar_depth_node:main',
            'surface_classifier_node = drone_control.surface_classifier_node:main',
            'bathymetric_survey_node = drone_control.bathymetric_survey_node:main',
        ],
    }, 
)
